using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace FishBook {
  public static class WindowMonitor {
    delegate bool EnumProc(IntPtr hwnd, IntPtr param);
    delegate void EventProc(IntPtr hook, uint evt, IntPtr hwnd, int obj, int child, uint thread, uint time);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr param);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder name, ref uint size);
    [DllImport("kernel32.dll")] static extern bool GetProcessTimes(IntPtr process, out long creation, out long exit, out long kernel, out long user);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, uint attribute, out int value, int size);
    [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr module, EventProc callback, uint process, uint thread, uint flags);
    [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr hook);
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    static readonly ConcurrentQueue<string> Commands = new ConcurrentQueue<string>();
    static readonly List<IntPtr> Hooks = new List<IntPtr>();
    static EventProc Callback;
    static int Owner;
    static IntPtr Tracked;
    static string TrackedId = "";
    static string LastSnapshot = "";
    static bool Ended;

    static Dictionary<string, object> Describe(IntPtr hwnd) {
      if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) return null;
      uint pid; GetWindowThreadProcessId(hwnd, out pid);
      IntPtr process = OpenProcess(0x1000, false, pid);
      if (process == IntPtr.Zero) return null;
      string appPath; long creation, exit, kernel, user;
      try {
        uint size = 32768;
        StringBuilder name = new StringBuilder((int)size);
        if (!QueryFullProcessImageName(process, 0, name, ref size) || !GetProcessTimes(process, out creation, out exit, out kernel, out user)) return null;
        appPath = name.ToString();
      } finally { CloseHandle(process); }
      StringBuilder title = new StringBuilder(512);
      GetWindowText(hwnd, title, title.Capacity);
      int cloaked = 0;
      DwmGetWindowAttribute(hwnd, 14, out cloaked, sizeof(int));
      return new Dictionary<string, object> {
        { "hwnd", hwnd.ToInt64().ToString() }, { "pid", (int)pid }, { "startedAt", creation.ToString() },
        { "appPath", appPath }, { "title", title.ToString() }, { "visible", IsWindowVisible(hwnd) },
        { "minimized", IsIconic(hwnd) }, { "cloaked", cloaked != 0 }
      };
    }
    static void Write(object value) { Console.WriteLine(Json.Serialize(value)); Console.Out.Flush(); }
    static void Snapshot(bool force) {
      IntPtr foreground = GetForegroundWindow();
      // 对话框归属到宿主根窗口，使保存对话框等不会打断单窗口绑定。
      if (foreground != IntPtr.Zero) foreground = GetAncestor(foreground, 3);
      var value = new { type = "snapshot", trackedHwnd = TrackedId, foreground = Describe(foreground), target = Describe(Tracked) };
      string next = Json.Serialize(value);
      if (force || next != LastSnapshot) { LastSnapshot = next; Console.WriteLine(next); Console.Out.Flush(); }
    }
    static void Handle(string line) {
      var request = Json.Deserialize<Dictionary<string, object>>(line);
      string command = Convert.ToString(request["command"]);
      if (command == "quit") { Application.ExitThread(); return; }
      if (command == "track") {
        long hwnd;
        Tracked = Int64.TryParse(Convert.ToString(request["hwnd"]), out hwnd) ? new IntPtr(hwnd) : IntPtr.Zero;
        TrackedId = Convert.ToString(request["hwnd"]);
        Snapshot(true);
      } else if (command == "list") {
        var windows = new List<Dictionary<string, object>>();
        EnumWindows(delegate(IntPtr hwnd, IntPtr param) {
          if (!IsWindowVisible(hwnd)) return true;
          var window = Describe(hwnd);
          if (window != null && (int)window["pid"] != Owner && !(bool)window["cloaked"] && !String.IsNullOrWhiteSpace((string)window["title"])) windows.Add(window);
          return true;
        }, IntPtr.Zero);
        Write(new { type = "windows", id = Convert.ToString(request["id"]), windows });
      } else if (command == "snapshot") Snapshot(true);
    }
    public static void Run(int owner) {
      Owner = owner;
      Callback = delegate(IntPtr hook, uint evt, IntPtr hwnd, int obj, int child, uint thread, uint time) {
        if (evt == 0x8001 && hwnd == Tracked && obj == 0) Tracked = IntPtr.Zero;
        Snapshot(false);
      };
      // OUTOFCONTEXT 无需向目标应用注入 DLL；保留自身事件以识别阅读器焦点。
      foreach (var range in new uint[][] { new uint[] { 3, 3 }, new uint[] { 0x16, 0x17 }, new uint[] { 0x8001, 0x8001 } }) {
        IntPtr hook = SetWinEventHook(range[0], range[1], IntPtr.Zero, Callback, 0, 0, 0);
        if (hook == IntPtr.Zero) throw new InvalidOperationException("Cannot listen for window changes");
        Hooks.Add(hook);
      }
      Task.Run(delegate {
        string line;
        while ((line = Console.ReadLine()) != null) Commands.Enqueue(line);
        Ended = true;
      });
      var timer = new Timer { Interval = 100 };
      int ticks = 0;
      timer.Tick += delegate {
        if (Ended) { Application.ExitThread(); return; }
        string command;
        while (Commands.TryDequeue(out command)) {
          try { Handle(command); } catch { Write(new { type = "error", message = "Invalid window monitor request" }); }
        }
        // 低频校验覆盖缺失的系统事件、最小化和虚拟桌面状态变化。
        if (++ticks % 5 == 0) Snapshot(false);
      };
      try { Write(new { type = "ready" }); Snapshot(true); timer.Start(); Application.Run(); }
      finally { timer.Dispose(); foreach (IntPtr hook in Hooks) UnhookWinEvent(hook); }
    }
  }
}
