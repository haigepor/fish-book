const BOOK_EXTENSIONS = ['txt', 'epub', 'html', 'htm', 'fb2'];
const MAX_BOOK_BYTES = 32 * 1024 * 1024;
const bookFormat = name => String(name).split('.').pop().toLowerCase();
const supportedBook = name => BOOK_EXTENSIONS.includes(bookFormat(name));

module.exports = { BOOK_EXTENSIONS, MAX_BOOK_BYTES, bookFormat, supportedBook };
