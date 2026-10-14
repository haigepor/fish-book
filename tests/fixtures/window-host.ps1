param([string] $Label = 'FishBook Binding Test', [int] $ReaderProcessId)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'
using System;
using System.Collections.Concurrent;
using System.Threading.Tasks;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public static class BindingTestHost {
  [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, IntPtr pid);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
  static void Focus(IntPtr hwnd) {
    uint current = GetCurrentThreadId(), foreground = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
    bool attached = current != foreground && AttachThreadInput(current, foreground, true);
    try { SetForegroundWindow(hwnd); } finally { if (attached) AttachThreadInput(current, foreground, false); }
  }
  public static void Run(string label, int readerProcessId) {
    var a = new Form { Text = label + " A", Width = 600, Height = 350 };
    var b = new Form { Text = label + " B", Width = 600, Height = 350 };
    a.Controls.Add(new Label { Text = "fish-book window binding integration test", AutoSize = true });
    b.Controls.Add(new Label { Text = "Second target window", AutoSize = true });
    var commands = new ConcurrentQueue<string>();
    Task.Run(delegate { string line; while ((line = Console.ReadLine()) != null) commands.Enqueue(line); commands.Enqueue("quit"); });
    var timer = new Timer { Interval = 50 };
    timer.Tick += delegate {
      string cmd;
      while (commands.TryDequeue(out cmd)) {
        if (cmd == "grant") { AllowSetForegroundWindow((uint)readerProcessId); continue; }
        if (cmd.StartsWith("activate")) { Focus(new IntPtr(Int64.Parse(cmd.Substring(8)))); continue; }
        if (cmd == "quit") { a.Dispose(); b.Dispose(); Application.ExitThread(); return; }
        var target = cmd.EndsWith("B") ? b : a;
        if (cmd.StartsWith("focus")) { target.Show(); target.WindowState = FormWindowState.Normal; Focus(target.Handle); }
        if (cmd.StartsWith("minimize")) target.WindowState = FormWindowState.Minimized;
        if (cmd.StartsWith("close")) target.Close();
      }
    };
    a.Show(); b.Show();
    Console.WriteLine("READY"); Console.Out.Flush();
    timer.Start();
    try { Application.Run(); } finally { timer.Dispose(); a.Dispose(); b.Dispose(); }
  }
}
'@
[BindingTestHost]::Run($Label, $ReaderProcessId)
