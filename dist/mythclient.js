(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
'use strict'

exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

function init () {
  var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  for (var i = 0, len = code.length; i < len; ++i) {
    lookup[i] = code[i]
    revLookup[code.charCodeAt(i)] = i
  }

  revLookup['-'.charCodeAt(0)] = 62
  revLookup['_'.charCodeAt(0)] = 63
}

init()

function toByteArray (b64) {
  var i, j, l, tmp, placeHolders, arr
  var len = b64.length

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // the number of equal signs (place holders)
  // if there are two placeholders, than the two characters before it
  // represent one byte
  // if there is only one, then the three characters before it represent 2 bytes
  // this is just a cheap hack to not do indexOf twice
  placeHolders = b64[len - 2] === '=' ? 2 : b64[len - 1] === '=' ? 1 : 0

  // base64 is 4/3 + up to two characters of the original data
  arr = new Arr(len * 3 / 4 - placeHolders)

  // if there are placeholders, only get up to the last complete 4 chars
  l = placeHolders > 0 ? len - 4 : len

  var L = 0

  for (i = 0, j = 0; i < l; i += 4, j += 3) {
    tmp = (revLookup[b64.charCodeAt(i)] << 18) | (revLookup[b64.charCodeAt(i + 1)] << 12) | (revLookup[b64.charCodeAt(i + 2)] << 6) | revLookup[b64.charCodeAt(i + 3)]
    arr[L++] = (tmp >> 16) & 0xFF
    arr[L++] = (tmp >> 8) & 0xFF
    arr[L++] = tmp & 0xFF
  }

  if (placeHolders === 2) {
    tmp = (revLookup[b64.charCodeAt(i)] << 2) | (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[L++] = tmp & 0xFF
  } else if (placeHolders === 1) {
    tmp = (revLookup[b64.charCodeAt(i)] << 10) | (revLookup[b64.charCodeAt(i + 1)] << 4) | (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[L++] = (tmp >> 8) & 0xFF
    arr[L++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var output = ''
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    output += lookup[tmp >> 2]
    output += lookup[(tmp << 4) & 0x3F]
    output += '=='
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + (uint8[len - 1])
    output += lookup[tmp >> 10]
    output += lookup[(tmp >> 4) & 0x3F]
    output += lookup[(tmp << 2) & 0x3F]
    output += '='
  }

  parts.push(output)

  return parts.join('')
}

},{}],3:[function(require,module,exports){
(function (global){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('isarray')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Due to various browser bugs, sometimes the Object implementation will be used even
 * when the browser supports typed arrays.
 *
 * Note:
 *
 *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
 *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *     incorrect length in some situations.

 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
 * get the Object implementation, which is slower but behaves correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = global.TYPED_ARRAY_SUPPORT !== undefined
  ? global.TYPED_ARRAY_SUPPORT
  : typedArraySupport()

/*
 * Export kMaxLength after typed array support is determined.
 */
exports.kMaxLength = kMaxLength()

function typedArraySupport () {
  try {
    var arr = new Uint8Array(1)
    arr.__proto__ = {__proto__: Uint8Array.prototype, foo: function () { return 42 }}
    return arr.foo() === 42 && // typed array instances can be augmented
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        arr.subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
}

function kMaxLength () {
  return Buffer.TYPED_ARRAY_SUPPORT
    ? 0x7fffffff
    : 0x3fffffff
}

function createBuffer (that, length) {
  if (kMaxLength() < length) {
    throw new RangeError('Invalid typed array length')
  }
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = new Uint8Array(length)
    that.__proto__ = Buffer.prototype
  } else {
    // Fallback: Return an object instance of the Buffer class
    if (that === null) {
      that = new Buffer(length)
    }
    that.length = length
  }

  return that
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  if (!Buffer.TYPED_ARRAY_SUPPORT && !(this instanceof Buffer)) {
    return new Buffer(arg, encodingOrOffset, length)
  }

  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new Error(
        'If encoding is specified then the first argument must be a string'
      )
    }
    return allocUnsafe(this, arg)
  }
  return from(this, arg, encodingOrOffset, length)
}

Buffer.poolSize = 8192 // not used by this implementation

// TODO: Legacy, not needed anymore. Remove in next major version.
Buffer._augment = function (arr) {
  arr.__proto__ = Buffer.prototype
  return arr
}

function from (that, value, encodingOrOffset, length) {
  if (typeof value === 'number') {
    throw new TypeError('"value" argument must not be a number')
  }

  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return fromArrayBuffer(that, value, encodingOrOffset, length)
  }

  if (typeof value === 'string') {
    return fromString(that, value, encodingOrOffset)
  }

  return fromObject(that, value)
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(null, value, encodingOrOffset, length)
}

if (Buffer.TYPED_ARRAY_SUPPORT) {
  Buffer.prototype.__proto__ = Uint8Array.prototype
  Buffer.__proto__ = Uint8Array
  if (typeof Symbol !== 'undefined' && Symbol.species &&
      Buffer[Symbol.species] === Buffer) {
    // Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
    Object.defineProperty(Buffer, Symbol.species, {
      value: null,
      configurable: true
    })
  }
}

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be a number')
  }
}

function alloc (that, size, fill, encoding) {
  assertSize(size)
  if (size <= 0) {
    return createBuffer(that, size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(that, size).fill(fill, encoding)
      : createBuffer(that, size).fill(fill)
  }
  return createBuffer(that, size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(null, size, fill, encoding)
}

function allocUnsafe (that, size) {
  assertSize(size)
  that = createBuffer(that, size < 0 ? 0 : checked(size) | 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < size; ++i) {
      that[i] = 0
    }
  }
  return that
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(null, size)
}
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(null, size)
}

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('"encoding" must be a valid string encoding')
  }

  var length = byteLength(string, encoding) | 0
  that = createBuffer(that, length)

  that.write(string, encoding)
  return that
}

function fromArrayLike (that, array) {
  var length = checked(array.length) | 0
  that = createBuffer(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function fromArrayBuffer (that, array, byteOffset, length) {
  array.byteLength // this throws if `array` is not a valid ArrayBuffer

  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('\'offset\' is out of bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('\'length\' is out of bounds')
  }

  if (byteOffset === undefined && length === undefined) {
    array = new Uint8Array(array)
  } else if (length === undefined) {
    array = new Uint8Array(array, byteOffset)
  } else {
    array = new Uint8Array(array, byteOffset, length)
  }

  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = array
    that.__proto__ = Buffer.prototype
  } else {
    // Fallback: Return an object instance of the Buffer class
    that = fromArrayLike(that, array)
  }
  return that
}

function fromObject (that, obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0
    that = createBuffer(that, len)

    if (that.length === 0) {
      return that
    }

    obj.copy(that, 0, 0, len)
    return that
  }

  if (obj) {
    if ((typeof ArrayBuffer !== 'undefined' &&
        obj.buffer instanceof ArrayBuffer) || 'length' in obj) {
      if (typeof obj.length !== 'number' || isnan(obj.length)) {
        return createBuffer(that, 0)
      }
      return fromArrayLike(that, obj)
    }

    if (obj.type === 'Buffer' && isArray(obj.data)) {
      return fromArrayLike(that, obj.data)
    }
  }

  throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
}

function checked (length) {
  // Note: cannot use `length < kMaxLength` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength()) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength().toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0
  }
  return Buffer.alloc(+length)
}

Buffer.isBuffer = function isBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; ++i) {
      length += list[i].length
    }
  }

  var buffer = Buffer.allocUnsafe(length)
  var pos = 0
  for (i = 0; i < list.length; ++i) {
    var buf = list[i]
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos)
    pos += buf.length
  }
  return buffer
}

function byteLength (string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length
  }
  if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' &&
      (ArrayBuffer.isView(string) || string instanceof ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    string = '' + string
  }

  var len = string.length
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'binary':
      case 'raw':
      case 'raws':
        return len
      case 'utf8':
      case 'utf-8':
      case undefined:
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0
  start >>>= 0

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8'

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'binary':
        return binarySlice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// The property is used by `Buffer.isBuffer` and `is-buffer` (in Safari 5-7) to detect
// Buffer instances.
Buffer.prototype._isBuffer = true

function swap (b, n, m) {
  var i = b[n]
  b[n] = b[m]
  b[m] = i
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1)
  }
  return this
}

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3)
    swap(this, i + 1, i + 2)
  }
  return this
}

Buffer.prototype.toString = function toString () {
  var length = this.length | 0
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (!Buffer.isBuffer(target)) {
    throw new TypeError('Argument must be a Buffer')
  }

  if (start === undefined) {
    start = 0
  }
  if (end === undefined) {
    end = target ? target.length : 0
  }
  if (thisStart === undefined) {
    thisStart = 0
  }
  if (thisEnd === undefined) {
    thisEnd = this.length
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0
  end >>>= 0
  thisStart >>>= 0
  thisEnd >>>= 0

  if (this === target) return 0

  var x = thisEnd - thisStart
  var y = end - start
  var len = Math.min(x, y)

  var thisCopy = this.slice(thisStart, thisEnd)
  var targetCopy = target.slice(start, end)

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i]
      y = targetCopy[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

function arrayIndexOf (arr, val, byteOffset, encoding) {
  var indexSize = 1
  var arrLength = arr.length
  var valLength = val.length

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase()
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2
      arrLength /= 2
      valLength /= 2
      byteOffset /= 2
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var foundIndex = -1
  for (var i = byteOffset; i < arrLength; ++i) {
    if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
      if (foundIndex === -1) foundIndex = i
      if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
    } else {
      if (foundIndex !== -1) i -= i - foundIndex
      foundIndex = -1
    }
  }

  return -1
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  if (typeof byteOffset === 'string') {
    encoding = byteOffset
    byteOffset = 0
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000
  }
  byteOffset >>= 0

  if (this.length === 0) return -1
  if (byteOffset >= this.length) return -1

  // Negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = Math.max(this.length + byteOffset, 0)

  if (typeof val === 'string') {
    val = Buffer.from(val, encoding)
  }

  if (Buffer.isBuffer(val)) {
    // special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(this, val, byteOffset, encoding)
  }
  if (typeof val === 'number') {
    if (Buffer.TYPED_ARRAY_SUPPORT && Uint8Array.prototype.indexOf === 'function') {
      return Uint8Array.prototype.indexOf.call(this, val, byteOffset)
    }
    return arrayIndexOf(this, [ val ], byteOffset, encoding)
  }

  throw new TypeError('val must be string, number or Buffer')
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(parsed)) return i
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0
    if (isFinite(length)) {
      length = length | 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'binary':
        return binaryWrite(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
      : (firstByte > 0xBF) ? 2
      : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function binarySlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = this.subarray(start, end)
    newBuf.__proto__ = Buffer.prototype
  } else {
    var sliceLen = end - start
    newBuf = new Buffer(sliceLen, undefined)
    for (var i = 0; i < sliceLen; ++i) {
      newBuf[i] = this[i + start]
    }
  }

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = (value & 0xff)
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; ++i) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; ++i) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start
  var i

  if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start]
    }
  } else if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    // ascending copy from start
    for (i = 0; i < len; ++i) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, start + len),
      targetStart
    )
  }

  return len
}

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = this.length
    } else if (typeof end === 'string') {
      encoding = end
      end = this.length
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0)
      if (code < 256) {
        val = code
      }
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
  } else if (typeof val === 'number') {
    val = val & 255
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0
  end = end === undefined ? this.length : end >>> 0

  if (!val) val = 0

  var i
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val
    }
  } else {
    var bytes = Buffer.isBuffer(val)
      ? val
      : utf8ToBytes(new Buffer(val, encoding).toString())
    var len = bytes.length
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

function isnan (val) {
  return val !== val // eslint-disable-line no-self-compare
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"base64-js":2,"ieee754":4,"isarray":5}],4:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],5:[function(require,module,exports){
var toString = {}.toString;

module.exports = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};

},{}],6:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require('_process'))
},{"_process":7}],7:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

(function () {
  try {
    cachedSetTimeout = setTimeout;
  } catch (e) {
    cachedSetTimeout = function () {
      throw new Error('setTimeout is not defined');
    }
  }
  try {
    cachedClearTimeout = clearTimeout;
  } catch (e) {
    cachedClearTimeout = function () {
      throw new Error('clearTimeout is not defined');
    }
  }
} ())
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = cachedSetTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    cachedClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        cachedSetTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],8:[function(require,module,exports){
(function (process,__filename){
/** vim: et:ts=4:sw=4:sts=4
 * @license amdefine 1.0.0 Copyright (c) 2011-2015, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/amdefine for details
 */

/*jslint node: true */
/*global module, process */
'use strict';

/**
 * Creates a define for node.
 * @param {Object} module the "module" object that is defined by Node for the
 * current module.
 * @param {Function} [requireFn]. Node's require function for the current module.
 * It only needs to be passed in Node versions before 0.5, when module.require
 * did not exist.
 * @returns {Function} a define function that is usable for the current node
 * module.
 */
function amdefine(module, requireFn) {
    'use strict';
    var defineCache = {},
        loaderCache = {},
        alreadyCalled = false,
        path = require('path'),
        makeRequire, stringRequire;

    /**
     * Trims the . and .. from an array of path segments.
     * It will keep a leading path segment if a .. will become
     * the first path segment, to help with module name lookups,
     * which act like paths, but can be remapped. But the end result,
     * all paths that use this function should look normalized.
     * NOTE: this method MODIFIES the input array.
     * @param {Array} ary the array of path segments.
     */
    function trimDots(ary) {
        var i, part;
        for (i = 0; ary[i]; i+= 1) {
            part = ary[i];
            if (part === '.') {
                ary.splice(i, 1);
                i -= 1;
            } else if (part === '..') {
                if (i === 1 && (ary[2] === '..' || ary[0] === '..')) {
                    //End of the line. Keep at least one non-dot
                    //path segment at the front so it can be mapped
                    //correctly to disk. Otherwise, there is likely
                    //no path mapping for a path starting with '..'.
                    //This can still fail, but catches the most reasonable
                    //uses of ..
                    break;
                } else if (i > 0) {
                    ary.splice(i - 1, 2);
                    i -= 2;
                }
            }
        }
    }

    function normalize(name, baseName) {
        var baseParts;

        //Adjust any relative paths.
        if (name && name.charAt(0) === '.') {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                baseParts = baseName.split('/');
                baseParts = baseParts.slice(0, baseParts.length - 1);
                baseParts = baseParts.concat(name.split('/'));
                trimDots(baseParts);
                name = baseParts.join('/');
            }
        }

        return name;
    }

    /**
     * Create the normalize() function passed to a loader plugin's
     * normalize method.
     */
    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(id) {
        function load(value) {
            loaderCache[id] = value;
        }

        load.fromText = function (id, text) {
            //This one is difficult because the text can/probably uses
            //define, and any relative paths and requires should be relative
            //to that id was it would be found on disk. But this would require
            //bootstrapping a module/require fairly deeply from node core.
            //Not sure how best to go about that yet.
            throw new Error('amdefine does not implement load.fromText');
        };

        return load;
    }

    makeRequire = function (systemRequire, exports, module, relId) {
        function amdRequire(deps, callback) {
            if (typeof deps === 'string') {
                //Synchronous, single module require('')
                return stringRequire(systemRequire, exports, module, deps, relId);
            } else {
                //Array of dependencies with a callback.

                //Convert the dependencies to modules.
                deps = deps.map(function (depName) {
                    return stringRequire(systemRequire, exports, module, depName, relId);
                });

                //Wait for next tick to call back the require call.
                if (callback) {
                    process.nextTick(function () {
                        callback.apply(null, deps);
                    });
                }
            }
        }

        amdRequire.toUrl = function (filePath) {
            if (filePath.indexOf('.') === 0) {
                return normalize(filePath, path.dirname(module.filename));
            } else {
                return filePath;
            }
        };

        return amdRequire;
    };

    //Favor explicit value, passed in if the module wants to support Node 0.4.
    requireFn = requireFn || function req() {
        return module.require.apply(module, arguments);
    };

    function runFactory(id, deps, factory) {
        var r, e, m, result;

        if (id) {
            e = loaderCache[id] = {};
            m = {
                id: id,
                uri: __filename,
                exports: e
            };
            r = makeRequire(requireFn, e, m, id);
        } else {
            //Only support one define call per file
            if (alreadyCalled) {
                throw new Error('amdefine with no module ID cannot be called more than once per file.');
            }
            alreadyCalled = true;

            //Use the real variables from node
            //Use module.exports for exports, since
            //the exports in here is amdefine exports.
            e = module.exports;
            m = module;
            r = makeRequire(requireFn, e, m, module.id);
        }

        //If there are dependencies, they are strings, so need
        //to convert them to dependency values.
        if (deps) {
            deps = deps.map(function (depName) {
                return r(depName);
            });
        }

        //Call the factory with the right dependencies.
        if (typeof factory === 'function') {
            result = factory.apply(m.exports, deps);
        } else {
            result = factory;
        }

        if (result !== undefined) {
            m.exports = result;
            if (id) {
                loaderCache[id] = m.exports;
            }
        }
    }

    stringRequire = function (systemRequire, exports, module, id, relId) {
        //Split the ID by a ! so that
        var index = id.indexOf('!'),
            originalId = id,
            prefix, plugin;

        if (index === -1) {
            id = normalize(id, relId);

            //Straight module lookup. If it is one of the special dependencies,
            //deal with it, otherwise, delegate to node.
            if (id === 'require') {
                return makeRequire(systemRequire, exports, module, relId);
            } else if (id === 'exports') {
                return exports;
            } else if (id === 'module') {
                return module;
            } else if (loaderCache.hasOwnProperty(id)) {
                return loaderCache[id];
            } else if (defineCache[id]) {
                runFactory.apply(null, defineCache[id]);
                return loaderCache[id];
            } else {
                if(systemRequire) {
                    return systemRequire(originalId);
                } else {
                    throw new Error('No module with ID: ' + id);
                }
            }
        } else {
            //There is a plugin in play.
            prefix = id.substring(0, index);
            id = id.substring(index + 1, id.length);

            plugin = stringRequire(systemRequire, exports, module, prefix, relId);

            if (plugin.normalize) {
                id = plugin.normalize(id, makeNormalize(relId));
            } else {
                //Normalize the ID normally.
                id = normalize(id, relId);
            }

            if (loaderCache[id]) {
                return loaderCache[id];
            } else {
                plugin.load(id, makeRequire(systemRequire, exports, module, relId), makeLoad(id), {});

                return loaderCache[id];
            }
        }
    };

    //Create a define function specific to the module asking for amdefine.
    function define(id, deps, factory) {
        if (Array.isArray(id)) {
            factory = deps;
            deps = id;
            id = undefined;
        } else if (typeof id !== 'string') {
            factory = id;
            id = deps = undefined;
        }

        if (deps && !Array.isArray(deps)) {
            factory = deps;
            deps = undefined;
        }

        if (!deps) {
            deps = ['require', 'exports', 'module'];
        }

        //Set up properties for this module. If an ID, then use
        //internal cache. If no ID, then use the external variables
        //for this node module.
        if (id) {
            //Put the module in deep freeze until there is a
            //require call for it.
            defineCache[id] = [id, deps, factory];
        } else {
            runFactory(id, deps, factory);
        }
    }

    //define.require, which has access to all the values in the
    //cache. Useful for AMD modules that all have IDs in the file,
    //but need to finally export a value to node based on one of those
    //IDs.
    define.require = function (id) {
        if (loaderCache[id]) {
            return loaderCache[id];
        }

        if (defineCache[id]) {
            runFactory.apply(null, defineCache[id]);
            return loaderCache[id];
        }
    };

    define.amd = {};

    return define;
}

module.exports = amdefine;

}).call(this,require('_process'),"/node_modules\\amdefine\\amdefine.js")
},{"_process":7,"path":6}],9:[function(require,module,exports){
(function() {
  var add, crispedges, feature, flexbox, gradients, logicalProps, prefix, resolution, result, sort,
    slice = [].slice;

  sort = function(array) {
    return array.sort(function(a, b) {
      var d;
      a = a.split(' ');
      b = b.split(' ');
      if (a[0] > b[0]) {
        return 1;
      } else if (a[0] < b[0]) {
        return -1;
      } else {
        d = parseFloat(a[1]) - parseFloat(b[1]);
        if (d > 0) {
          return 1;
        } else if (d < 0) {
          return -1;
        } else {
          return 0;
        }
      }
    });
  };

  feature = function(data, opts, callback) {
    var browser, match, need, ref, ref1, support, version, versions;
    if (!callback) {
      ref = [opts, {}], callback = ref[0], opts = ref[1];
    }
    match = opts.match || /\sx($|\s)/;
    need = [];
    ref1 = data.stats;
    for (browser in ref1) {
      versions = ref1[browser];
      for (version in versions) {
        support = versions[version];
        if (support.match(match)) {
          need.push(browser + ' ' + version);
        }
      }
    }
    return callback(sort(need));
  };

  result = {};

  prefix = function() {
    var data, i, j, k, len, name, names, results;
    names = 2 <= arguments.length ? slice.call(arguments, 0, j = arguments.length - 1) : (j = 0, []), data = arguments[j++];
    results = [];
    for (k = 0, len = names.length; k < len; k++) {
      name = names[k];
      result[name] = {};
      results.push((function() {
        var results1;
        results1 = [];
        for (i in data) {
          results1.push(result[name][i] = data[i]);
        }
        return results1;
      })());
    }
    return results;
  };

  add = function() {
    var data, j, k, len, name, names, results;
    names = 2 <= arguments.length ? slice.call(arguments, 0, j = arguments.length - 1) : (j = 0, []), data = arguments[j++];
    results = [];
    for (k = 0, len = names.length; k < len; k++) {
      name = names[k];
      results.push(result[name].browsers = sort(result[name].browsers.concat(data.browsers)));
    }
    return results;
  };

  module.exports = result;

  feature(require('caniuse-db/features-json/border-radius'), function(browsers) {
    return prefix('border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius', {
      mistakes: ['-ms-', '-o-'],
      transition: true,
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/css-boxshadow'), function(browsers) {
    return prefix('box-shadow', {
      transition: true,
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/css-animation'), function(browsers) {
    return prefix('animation', 'animation-name', 'animation-duration', 'animation-delay', 'animation-direction', 'animation-fill-mode', 'animation-iteration-count', 'animation-play-state', 'animation-timing-function', '@keyframes', {
      mistakes: ['-ms-'],
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/css-transitions'), function(browsers) {
    return prefix('transition', 'transition-property', 'transition-duration', 'transition-delay', 'transition-timing-function', {
      mistakes: ['-ms-'],
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/transforms2d'), function(browsers) {
    return prefix('transform', 'transform-origin', {
      transition: true,
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/transforms3d'), function(browsers) {
    prefix('perspective', 'perspective-origin', {
      transition: true,
      browsers: browsers
    });
    return prefix('transform-style', 'backface-visibility', {
      browsers: browsers
    });
  });

  gradients = require('caniuse-db/features-json/css-gradients');

  feature(gradients, {
    match: /y\sx/
  }, function(browsers) {
    return prefix('linear-gradient', 'repeating-linear-gradient', 'radial-gradient', 'repeating-radial-gradient', {
      props: ['background', 'background-image', 'border-image', 'list-style', 'list-style-image', 'content', 'mask-image', 'mask'],
      mistakes: ['-ms-'],
      browsers: browsers
    });
  });

  feature(gradients, {
    match: /a\sx/
  }, function(browsers) {
    browsers = browsers.map(function(i) {
      if (/op/.test(i)) {
        return i;
      } else {
        return i + " old";
      }
    });
    return add('linear-gradient', 'repeating-linear-gradient', 'radial-gradient', 'repeating-radial-gradient', {
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/css3-boxsizing'), function(browsers) {
    return prefix('box-sizing', {
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/css-filters'), function(browsers) {
    return prefix('filter', {
      transition: true,
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/multicolumn'), function(browsers) {
    prefix('columns', 'column-width', 'column-gap', 'column-rule', 'column-rule-color', 'column-rule-width', {
      transition: true,
      browsers: browsers
    });
    return prefix('column-count', 'column-rule-style', 'column-span', 'column-fill', 'break-before', 'break-after', 'break-inside', {
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/user-select-none'), function(browsers) {
    return prefix('user-select', {
      browsers: browsers
    });
  });

  flexbox = require('caniuse-db/features-json/flexbox');

  feature(flexbox, {
    match: /a\sx/
  }, function(browsers) {
    browsers = browsers.map(function(i) {
      if (/ie|firefox/.test(i)) {
        return i;
      } else {
        return i + " 2009";
      }
    });
    prefix('display-flex', 'inline-flex', {
      props: ['display'],
      browsers: browsers
    });
    prefix('flex', 'flex-grow', 'flex-shrink', 'flex-basis', {
      transition: true,
      browsers: browsers
    });
    return prefix('flex-direction', 'flex-wrap', 'flex-flow', 'justify-content', 'order', 'align-items', 'align-self', 'align-content', {
      browsers: browsers
    });
  });

  feature(flexbox, {
    match: /y\sx/
  }, function(browsers) {
    add('display-flex', 'inline-flex', {
      browsers: browsers
    });
    add('flex', 'flex-grow', 'flex-shrink', 'flex-basis', {
      browsers: browsers
    });
    return add('flex-direction', 'flex-wrap', 'flex-flow', 'justify-content', 'order', 'align-items', 'align-self', 'align-content', {
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/calc'), function(browsers) {
    return prefix('calc', {
      props: ['*'],
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/background-img-opts'), function(browsers) {
    return prefix('background-clip', 'background-origin', 'background-size', {
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/font-feature'), function(browsers) {
    return prefix('font-feature-settings', 'font-variant-ligatures', 'font-language-override', 'font-kerning', {
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/border-image'), function(browsers) {
    return prefix('border-image', {
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/css-selection'), function(browsers) {
    return prefix('::selection', {
      selector: true,
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/css-placeholder'), function(browsers) {
    browsers = browsers.map(function(i) {
      var name, ref, version;
      ref = i.split(' '), name = ref[0], version = ref[1];
      if (name === 'firefox' && parseFloat(version) <= 18) {
        return i + ' old';
      } else {
        return i;
      }
    });
    return prefix('::placeholder', {
      selector: true,
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/css-hyphens'), function(browsers) {
    return prefix('hyphens', {
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/fullscreen'), function(browsers) {
    return prefix(':fullscreen', {
      selector: true,
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/css3-tabsize'), function(browsers) {
    return prefix('tab-size', {
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/intrinsic-width'), function(browsers) {
    return prefix('max-content', 'min-content', 'fit-content', 'fill-available', {
      props: ['width', 'min-width', 'max-width', 'height', 'min-height', 'max-height'],
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/css3-cursors-newer'), function(browsers) {
    prefix('zoom-in', 'zoom-out', {
      props: ['cursor'],
      browsers: browsers.concat(['chrome 3'])
    });
    return prefix('grab', 'grabbing', {
      props: ['cursor'],
      browsers: browsers.concat(['firefox 24', 'firefox 25', 'firefox 26'])
    });
  });

  feature(require('caniuse-db/features-json/css-sticky'), function(browsers) {
    return prefix('sticky', {
      props: ['position'],
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/pointer'), function(browsers) {
    return prefix('touch-action', {
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/text-decoration'), function(browsers) {
    return prefix('text-decoration-style', 'text-decoration-line', 'text-decoration-color', {
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/text-size-adjust'), function(browsers) {
    return prefix('text-size-adjust', {
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/css-masks'), function(browsers) {
    prefix('mask-clip', 'mask-composite', 'mask-image', 'mask-origin', 'mask-repeat', {
      browsers: browsers
    });
    return prefix('clip-path', 'mask', 'mask-position', 'mask-size', {
      transition: true,
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/css-boxdecorationbreak'), function(brwsrs) {
    return prefix('box-decoration-break', {
      browsers: brwsrs
    });
  });

  feature(require('caniuse-db/features-json/object-fit'), function(browsers) {
    return prefix('object-fit', 'object-position', {
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/css-shapes'), function(browsers) {
    return prefix('shape-margin', 'shape-outside', 'shape-image-threshold', {
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/text-overflow'), function(browsers) {
    return prefix('text-overflow', {
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/text-emphasis'), function(browsers) {
    return prefix('text-emphasis', {
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/css-deviceadaptation'), function(browsers) {
    return prefix('@viewport', {
      browsers: browsers
    });
  });

  resolution = require('caniuse-db/features-json/css-media-resolution');

  feature(resolution, {
    match: /( x($| )|a #3)/
  }, function(browsers) {
    return prefix('@resolution', {
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/css-text-align-last'), function(browsers) {
    return prefix('text-align-last', {
      browsers: browsers
    });
  });

  crispedges = require('caniuse-db/features-json/css-crisp-edges');

  feature(crispedges, {
    match: /y x/
  }, function(browsers) {
    return prefix('pixelated', {
      props: ['image-rendering'],
      browsers: browsers
    });
  });

  feature(crispedges, {
    match: /a x #2/
  }, function(browsers) {
    return prefix('image-rendering', {
      browsers: browsers
    });
  });

  logicalProps = require('caniuse-db/features-json/css-logical-props');

  feature(logicalProps, function(browsers) {
    return prefix('border-inline-start', 'border-inline-end', 'margin-inline-start', 'margin-inline-end', 'padding-inline-start', 'padding-inline-end', {
      transition: true,
      browsers: browsers
    });
  });

  feature(logicalProps, {
    match: /x\s#2/
  }, function(browsers) {
    return prefix('border-block-start', 'border-block-end', 'margin-block-start', 'margin-block-end', 'padding-block-start', 'padding-block-end', {
      transition: true,
      browsers: browsers
    });
  });

  feature(require('caniuse-db/features-json/css-appearance'), function(browsers) {
    return prefix('appearance', {
      browsers: browsers
    });
  });

}).call(this);

},{"caniuse-db/features-json/background-img-opts":60,"caniuse-db/features-json/border-image":61,"caniuse-db/features-json/border-radius":62,"caniuse-db/features-json/calc":63,"caniuse-db/features-json/css-animation":64,"caniuse-db/features-json/css-appearance":65,"caniuse-db/features-json/css-boxdecorationbreak":66,"caniuse-db/features-json/css-boxshadow":67,"caniuse-db/features-json/css-crisp-edges":68,"caniuse-db/features-json/css-deviceadaptation":69,"caniuse-db/features-json/css-filters":70,"caniuse-db/features-json/css-gradients":71,"caniuse-db/features-json/css-hyphens":72,"caniuse-db/features-json/css-logical-props":73,"caniuse-db/features-json/css-masks":74,"caniuse-db/features-json/css-media-resolution":75,"caniuse-db/features-json/css-placeholder":76,"caniuse-db/features-json/css-selection":77,"caniuse-db/features-json/css-shapes":78,"caniuse-db/features-json/css-sticky":79,"caniuse-db/features-json/css-text-align-last":80,"caniuse-db/features-json/css-transitions":81,"caniuse-db/features-json/css3-boxsizing":82,"caniuse-db/features-json/css3-cursors-newer":83,"caniuse-db/features-json/css3-tabsize":84,"caniuse-db/features-json/flexbox":85,"caniuse-db/features-json/font-feature":86,"caniuse-db/features-json/fullscreen":87,"caniuse-db/features-json/intrinsic-width":88,"caniuse-db/features-json/multicolumn":89,"caniuse-db/features-json/object-fit":90,"caniuse-db/features-json/pointer":91,"caniuse-db/features-json/text-decoration":92,"caniuse-db/features-json/text-emphasis":93,"caniuse-db/features-json/text-overflow":94,"caniuse-db/features-json/text-size-adjust":95,"caniuse-db/features-json/transforms2d":96,"caniuse-db/features-json/transforms3d":97,"caniuse-db/features-json/user-select-none":98}],10:[function(require,module,exports){
(function() {
  var AtRule, Prefixer,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  Prefixer = require('./prefixer');

  AtRule = (function(superClass) {
    extend(AtRule, superClass);

    function AtRule() {
      return AtRule.__super__.constructor.apply(this, arguments);
    }

    AtRule.prototype.add = function(rule, prefix) {
      var already, cloned, prefixed;
      prefixed = prefix + rule.name;
      already = rule.parent.some(function(i) {
        return i.name === prefixed && i.params === rule.params;
      });
      if (already) {
        return;
      }
      cloned = this.clone(rule, {
        name: prefixed
      });
      return rule.parent.insertBefore(rule, cloned);
    };

    AtRule.prototype.process = function(node) {
      var j, len, parent, prefix, ref, results;
      parent = this.parentPrefix(node);
      ref = this.prefixes;
      results = [];
      for (j = 0, len = ref.length; j < len; j++) {
        prefix = ref[j];
        if (parent && parent !== prefix) {
          continue;
        }
        results.push(this.add(node, prefix));
      }
      return results;
    };

    return AtRule;

  })(Prefixer);

  module.exports = AtRule;

}).call(this);

},{"./prefixer":49}],11:[function(require,module,exports){
(function() {
  var Browsers, Prefixes, browserslist, cache, isPlainObject, postcss,
    slice = [].slice;

  browserslist = require('browserslist');

  postcss = require('postcss');

  Browsers = require('./browsers');

  Prefixes = require('./prefixes');

  isPlainObject = function(obj) {
    return Object.prototype.toString.apply(obj) === '[object Object]';
  };

  cache = {};

  module.exports = postcss.plugin('autoprefixer', function() {
    var loadPrefixes, options, plugin, reqs;
    reqs = 1 <= arguments.length ? slice.call(arguments, 0) : [];
    if (reqs.length === 1 && isPlainObject(reqs[0])) {
      options = reqs[0];
      reqs = void 0;
    } else if (reqs.length === 0 || (reqs.length === 1 && (reqs[0] == null))) {
      reqs = void 0;
    } else if (reqs.length <= 2 && (reqs[0] instanceof Array || (reqs[0] == null))) {
      options = reqs[1];
      reqs = reqs[0];
    } else if (typeof reqs[reqs.length - 1] === 'object') {
      options = reqs.pop();
    }
    options || (options = {});
    if (options.browsers != null) {
      reqs = options.browsers;
    }
    loadPrefixes = function(opts) {
      var browsers, key;
      browsers = new Browsers(module.exports.data.browsers, reqs, opts);
      key = browsers.selected.join(', ') + options.cascade;
      return cache[key] || (cache[key] = new Prefixes(module.exports.data.prefixes, browsers, options));
    };
    plugin = function(css, result) {
      var prefixes;
      prefixes = loadPrefixes({
        from: css.source.input.file
      });
      if (options.remove !== false) {
        prefixes.processor.remove(css);
      }
      if (options.add !== false) {
        return prefixes.processor.add(css, result);
      }
    };
    plugin.options = options;
    plugin.process = function(str, options) {
      if (options == null) {
        options = {};
      }
      if (typeof console !== "undefined" && console !== null) {
        if (typeof console.warn === "function") {
          console.warn('Autoprefixer\'s process() method is deprecated ' + 'and will removed in next major release. ' + 'Use postcss([autoprefixer]).process() instead');
        }
      }
      return postcss(plugin).process(str, options);
    };
    plugin.info = function(opts) {
      return require('./info')(loadPrefixes(opts));
    };
    return plugin;
  });

  module.exports.data = {
    browsers: require('caniuse-db/data').agents,
    prefixes: require('../data/prefixes')
  };

  module.exports.defaults = browserslist.defaults;

  module.exports.process = function(css, options) {
    return module.exports().process(css, options);
  };

  module.exports.info = function() {
    return module.exports().info();
  };

}).call(this);

},{"../data/prefixes":9,"./browsers":12,"./info":46,"./prefixes":50,"browserslist":58,"caniuse-db/data":59,"postcss":152}],12:[function(require,module,exports){
(function() {
  var Browsers, browserslist, utils;

  browserslist = require('browserslist');

  utils = require('./utils');

  Browsers = (function() {
    Browsers.prefixes = function() {
      var data, i, name;
      if (this.prefixesCache) {
        return this.prefixesCache;
      }
      data = require('caniuse-db/data').agents;
      return this.prefixesCache = utils.uniq((function() {
        var results;
        results = [];
        for (name in data) {
          i = data[name];
          results.push("-" + i.prefix + "-");
        }
        return results;
      })()).sort(function(a, b) {
        return b.length - a.length;
      });
    };

    Browsers.withPrefix = function(value) {
      if (!this.prefixesRegexp) {
        this.prefixesRegexp = RegExp("" + (this.prefixes().join('|')));
      }
      return this.prefixesRegexp.test(value);
    };

    function Browsers(data1, requirements, options) {
      this.data = data1;
      this.options = options;
      this.selected = this.parse(requirements);
    }

    Browsers.prototype.parse = function(requirements) {
      var ref;
      return browserslist(requirements, {
        path: (ref = this.options) != null ? ref.from : void 0
      });
    };

    Browsers.prototype.browsers = function(criteria) {
      var browser, data, ref, selected, versions;
      selected = [];
      ref = this.data;
      for (browser in ref) {
        data = ref[browser];
        versions = criteria(data).map(function(version) {
          return browser + " " + version;
        });
        selected = selected.concat(versions);
      }
      return selected;
    };

    Browsers.prototype.prefix = function(browser) {
      var data, name, prefix, ref, version;
      ref = browser.split(' '), name = ref[0], version = ref[1];
      data = this.data[name];
      if (data.prefix_exceptions) {
        prefix = data.prefix_exceptions[version];
      }
      prefix || (prefix = data.prefix);
      return '-' + prefix + '-';
    };

    Browsers.prototype.isSelected = function(browser) {
      return this.selected.indexOf(browser) !== -1;
    };

    return Browsers;

  })();

  module.exports = Browsers;

}).call(this);

},{"./utils":55,"browserslist":58,"caniuse-db/data":59}],13:[function(require,module,exports){
(function() {
  var Browsers, Declaration, Prefixer, utils, vendor,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  Prefixer = require('./prefixer');

  Browsers = require('./browsers');

  vendor = require('postcss/lib/vendor');

  utils = require('./utils');

  Declaration = (function(superClass) {
    extend(Declaration, superClass);

    function Declaration() {
      return Declaration.__super__.constructor.apply(this, arguments);
    }

    Declaration.prototype.check = function(decl) {
      return true;
    };

    Declaration.prototype.prefixed = function(prop, prefix) {
      return prefix + prop;
    };

    Declaration.prototype.normalize = function(prop) {
      return prop;
    };

    Declaration.prototype.otherPrefixes = function(value, prefix) {
      var j, len, other, ref;
      ref = Browsers.prefixes();
      for (j = 0, len = ref.length; j < len; j++) {
        other = ref[j];
        if (other === prefix) {
          continue;
        }
        if (value.indexOf(other) !== -1) {
          return true;
        }
      }
      return false;
    };

    Declaration.prototype.set = function(decl, prefix) {
      decl.prop = this.prefixed(decl.prop, prefix);
      return decl;
    };

    Declaration.prototype.needCascade = function(decl) {
      return decl._autoprefixerCascade || (decl._autoprefixerCascade = this.all.options.cascade !== false && decl.style('before').indexOf('\n') !== -1);
    };

    Declaration.prototype.maxPrefixed = function(prefixes, decl) {
      var j, len, max, prefix;
      if (decl._autoprefixerMax) {
        return decl._autoprefixerMax;
      }
      max = 0;
      for (j = 0, len = prefixes.length; j < len; j++) {
        prefix = prefixes[j];
        prefix = utils.removeNote(prefix);
        if (prefix.length > max) {
          max = prefix.length;
        }
      }
      return decl._autoprefixerMax = max;
    };

    Declaration.prototype.calcBefore = function(prefixes, decl, prefix) {
      var before, diff, i, j, max, ref;
      if (prefix == null) {
        prefix = '';
      }
      before = decl.style('before');
      max = this.maxPrefixed(prefixes, decl);
      diff = max - utils.removeNote(prefix).length;
      for (i = j = 0, ref = diff; 0 <= ref ? j < ref : j > ref; i = 0 <= ref ? ++j : --j) {
        before += ' ';
      }
      return before;
    };

    Declaration.prototype.restoreBefore = function(decl) {
      var lines, min;
      lines = decl.style('before').split("\n");
      min = lines[lines.length - 1];
      this.all.group(decl).up(function(prefixed) {
        var array, last;
        array = prefixed.style('before').split("\n");
        last = array[array.length - 1];
        if (last.length < min.length) {
          return min = last;
        }
      });
      lines[lines.length - 1] = min;
      return decl.before = lines.join("\n");
    };

    Declaration.prototype.insert = function(decl, prefix, prefixes) {
      var cloned;
      cloned = this.set(this.clone(decl), prefix);
      if (!cloned) {
        return;
      }
      if (this.needCascade(decl)) {
        cloned.before = this.calcBefore(prefixes, decl, prefix);
      }
      return decl.parent.insertBefore(decl, cloned);
    };

    Declaration.prototype.add = function(decl, prefix, prefixes) {
      var already, prefixed;
      prefixed = this.prefixed(decl.prop, prefix);
      already = this.all.group(decl).up(function(i) {
        return i.prop === prefixed;
      });
      already || (already = this.all.group(decl).down(function(i) {
        return i.prop === prefixed;
      }));
      if (already || this.otherPrefixes(decl.value, prefix)) {
        return;
      }
      return this.insert(decl, prefix, prefixes);
    };

    Declaration.prototype.process = function(decl) {
      var prefixes;
      if (this.needCascade(decl)) {
        prefixes = Declaration.__super__.process.apply(this, arguments);
        if (prefixes != null ? prefixes.length : void 0) {
          this.restoreBefore(decl);
          return decl.before = this.calcBefore(prefixes, decl);
        }
      } else {
        return Declaration.__super__.process.apply(this, arguments);
      }
    };

    Declaration.prototype.old = function(prop, prefix) {
      return [this.prefixed(prop, prefix)];
    };

    return Declaration;

  })(Prefixer);

  module.exports = Declaration;

}).call(this);

},{"./browsers":12,"./prefixer":49,"./utils":55,"postcss/lib/vendor":159}],14:[function(require,module,exports){
(function() {
  var AlignContent, Declaration, flexSpec,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  flexSpec = require('./flex-spec');

  Declaration = require('../declaration');

  AlignContent = (function(superClass) {
    extend(AlignContent, superClass);

    function AlignContent() {
      return AlignContent.__super__.constructor.apply(this, arguments);
    }

    AlignContent.names = ['align-content', 'flex-line-pack'];

    AlignContent.oldValues = {
      'flex-end': 'end',
      'flex-start': 'start',
      'space-between': 'justify',
      'space-around': 'distribute'
    };

    AlignContent.prototype.prefixed = function(prop, prefix) {
      var ref, spec;
      ref = flexSpec(prefix), spec = ref[0], prefix = ref[1];
      if (spec === 2012) {
        return prefix + 'flex-line-pack';
      } else {
        return AlignContent.__super__.prefixed.apply(this, arguments);
      }
    };

    AlignContent.prototype.normalize = function(prop) {
      return 'align-content';
    };

    AlignContent.prototype.set = function(decl, prefix) {
      var spec;
      spec = flexSpec(prefix)[0];
      if (spec === 2012) {
        decl.value = AlignContent.oldValues[decl.value] || decl.value;
        return AlignContent.__super__.set.call(this, decl, prefix);
      } else if (spec === 'final') {
        return AlignContent.__super__.set.apply(this, arguments);
      }
    };

    return AlignContent;

  })(Declaration);

  module.exports = AlignContent;

}).call(this);

},{"../declaration":13,"./flex-spec":32}],15:[function(require,module,exports){
(function() {
  var AlignItems, Declaration, flexSpec,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  flexSpec = require('./flex-spec');

  Declaration = require('../declaration');

  AlignItems = (function(superClass) {
    extend(AlignItems, superClass);

    function AlignItems() {
      return AlignItems.__super__.constructor.apply(this, arguments);
    }

    AlignItems.names = ['align-items', 'flex-align', 'box-align'];

    AlignItems.oldValues = {
      'flex-end': 'end',
      'flex-start': 'start'
    };

    AlignItems.prototype.prefixed = function(prop, prefix) {
      var ref, spec;
      ref = flexSpec(prefix), spec = ref[0], prefix = ref[1];
      if (spec === 2009) {
        return prefix + 'box-align';
      } else if (spec === 2012) {
        return prefix + 'flex-align';
      } else {
        return AlignItems.__super__.prefixed.apply(this, arguments);
      }
    };

    AlignItems.prototype.normalize = function(prop) {
      return 'align-items';
    };

    AlignItems.prototype.set = function(decl, prefix) {
      var spec;
      spec = flexSpec(prefix)[0];
      if (spec === 2009 || spec === 2012) {
        decl.value = AlignItems.oldValues[decl.value] || decl.value;
        return AlignItems.__super__.set.call(this, decl, prefix);
      } else {
        return AlignItems.__super__.set.apply(this, arguments);
      }
    };

    return AlignItems;

  })(Declaration);

  module.exports = AlignItems;

}).call(this);

},{"../declaration":13,"./flex-spec":32}],16:[function(require,module,exports){
(function() {
  var AlignSelf, Declaration, flexSpec,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  flexSpec = require('./flex-spec');

  Declaration = require('../declaration');

  AlignSelf = (function(superClass) {
    extend(AlignSelf, superClass);

    function AlignSelf() {
      return AlignSelf.__super__.constructor.apply(this, arguments);
    }

    AlignSelf.names = ['align-self', 'flex-item-align'];

    AlignSelf.oldValues = {
      'flex-end': 'end',
      'flex-start': 'start'
    };

    AlignSelf.prototype.prefixed = function(prop, prefix) {
      var ref, spec;
      ref = flexSpec(prefix), spec = ref[0], prefix = ref[1];
      if (spec === 2012) {
        return prefix + 'flex-item-align';
      } else {
        return AlignSelf.__super__.prefixed.apply(this, arguments);
      }
    };

    AlignSelf.prototype.normalize = function(prop) {
      return 'align-self';
    };

    AlignSelf.prototype.set = function(decl, prefix) {
      var spec;
      spec = flexSpec(prefix)[0];
      if (spec === 2012) {
        decl.value = AlignSelf.oldValues[decl.value] || decl.value;
        return AlignSelf.__super__.set.call(this, decl, prefix);
      } else if (spec === 'final') {
        return AlignSelf.__super__.set.apply(this, arguments);
      }
    };

    return AlignSelf;

  })(Declaration);

  module.exports = AlignSelf;

}).call(this);

},{"../declaration":13,"./flex-spec":32}],17:[function(require,module,exports){
(function() {
  var Appearance, Declaration,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  Declaration = require('../declaration');

  Appearance = (function(superClass) {
    extend(Appearance, superClass);

    function Appearance() {
      return Appearance.__super__.constructor.apply(this, arguments);
    }

    Appearance.names = ['appearance'];

    Appearance.prototype.check = function(decl) {
      return decl.value.toLowerCase() === 'none';
    };

    return Appearance;

  })(Declaration);

  module.exports = Appearance;

}).call(this);

},{"../declaration":13}],18:[function(require,module,exports){
(function() {
  var BackgroundSize, Declaration,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  Declaration = require('../declaration');

  BackgroundSize = (function(superClass) {
    extend(BackgroundSize, superClass);

    function BackgroundSize() {
      return BackgroundSize.__super__.constructor.apply(this, arguments);
    }

    BackgroundSize.names = ['background-size'];

    BackgroundSize.prototype.set = function(decl, prefix) {
      var value;
      value = decl.value.toLowerCase();
      if (prefix === '-webkit-' && value.indexOf(' ') === -1 && value !== 'contain' && value !== 'cover') {
        decl.value = decl.value + ' ' + decl.value;
      }
      return BackgroundSize.__super__.set.call(this, decl, prefix);
    };

    return BackgroundSize;

  })(Declaration);

  module.exports = BackgroundSize;

}).call(this);

},{"../declaration":13}],19:[function(require,module,exports){
(function() {
  var BlockLogical, Declaration,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  Declaration = require('../declaration');

  BlockLogical = (function(superClass) {
    extend(BlockLogical, superClass);

    function BlockLogical() {
      return BlockLogical.__super__.constructor.apply(this, arguments);
    }

    BlockLogical.names = ['border-block-start', 'border-block-end', 'margin-block-start', 'margin-block-end', 'padding-block-start', 'padding-block-end', 'border-before', 'border-after', 'margin-before', 'margin-after', 'padding-before', 'padding-after'];

    BlockLogical.prototype.prefixed = function(prop, prefix) {
      return prefix + (prop.indexOf('-start') !== -1 ? prop.replace('-block-start', '-before') : prop.replace('-block-end', '-after'));
    };

    BlockLogical.prototype.normalize = function(prop) {
      if (prop.indexOf('-before') !== -1) {
        return prop.replace('-before', '-block-start');
      } else {
        return prop.replace('-after', '-block-end');
      }
    };

    return BlockLogical;

  })(Declaration);

  module.exports = BlockLogical;

}).call(this);

},{"../declaration":13}],20:[function(require,module,exports){
(function() {
  var BorderImage, Declaration,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  Declaration = require('../declaration');

  BorderImage = (function(superClass) {
    extend(BorderImage, superClass);

    function BorderImage() {
      return BorderImage.__super__.constructor.apply(this, arguments);
    }

    BorderImage.names = ['border-image'];

    BorderImage.prototype.set = function(decl, prefix) {
      decl.value = decl.value.replace(/\s+fill(\s)/, '$1');
      return BorderImage.__super__.set.call(this, decl, prefix);
    };

    return BorderImage;

  })(Declaration);

  module.exports = BorderImage;

}).call(this);

},{"../declaration":13}],21:[function(require,module,exports){
(function() {
  var BorderRadius, Declaration,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  Declaration = require('../declaration');

  BorderRadius = (function(superClass) {
    var hor, i, j, len, len1, mozilla, normal, ref, ref1, ver;

    extend(BorderRadius, superClass);

    function BorderRadius() {
      return BorderRadius.__super__.constructor.apply(this, arguments);
    }

    BorderRadius.names = ['border-radius'];

    BorderRadius.toMozilla = {};

    BorderRadius.toNormal = {};

    ref = ['top', 'bottom'];
    for (i = 0, len = ref.length; i < len; i++) {
      ver = ref[i];
      ref1 = ['left', 'right'];
      for (j = 0, len1 = ref1.length; j < len1; j++) {
        hor = ref1[j];
        normal = "border-" + ver + "-" + hor + "-radius";
        mozilla = "border-radius-" + ver + hor;
        BorderRadius.names.push(normal);
        BorderRadius.names.push(mozilla);
        BorderRadius.toMozilla[normal] = mozilla;
        BorderRadius.toNormal[mozilla] = normal;
      }
    }

    BorderRadius.prototype.prefixed = function(prop, prefix) {
      if (prefix === '-moz-') {
        return prefix + (BorderRadius.toMozilla[prop] || prop);
      } else {
        return BorderRadius.__super__.prefixed.apply(this, arguments);
      }
    };

    BorderRadius.prototype.normalize = function(prop) {
      return BorderRadius.toNormal[prop] || prop;
    };

    return BorderRadius;

  })(Declaration);

  module.exports = BorderRadius;

}).call(this);

},{"../declaration":13}],22:[function(require,module,exports){
(function() {
  var BreakInside, Declaration,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  Declaration = require('../declaration');

  BreakInside = (function(superClass) {
    extend(BreakInside, superClass);

    function BreakInside() {
      return BreakInside.__super__.constructor.apply(this, arguments);
    }

    BreakInside.names = ['break-inside', 'page-break-inside', 'column-break-inside'];

    BreakInside.prototype.prefixed = function(prop, prefix) {
      if (prefix === '-webkit-') {
        return prefix + 'column-break-inside';
      } else if (prefix === '-moz-') {
        return 'page-break-inside';
      } else {
        return BreakInside.__super__.prefixed.apply(this, arguments);
      }
    };

    BreakInside.prototype.normalize = function() {
      return 'break-inside';
    };

    BreakInside.prototype.set = function(decl, prefix) {
      if (decl.value === 'avoid-column' || decl.value === 'avoid-page') {
        decl.value = 'avoid';
      }
      return BreakInside.__super__.set.apply(this, arguments);
    };

    BreakInside.prototype.insert = function(decl, prefix, prefixes) {
      if (decl.value === 'avoid-region') {

      } else if (decl.value === 'avoid-page' && prefix === '-webkit-') {

      } else {
        return BreakInside.__super__.insert.apply(this, arguments);
      }
    };

    return BreakInside;

  })(Declaration);

  module.exports = BreakInside;

}).call(this);

},{"../declaration":13}],23:[function(require,module,exports){
(function() {
  var DisplayFlex, OldDisplayFlex, OldValue, Value, flexSpec,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  flexSpec = require('./flex-spec');

  OldValue = require('../old-value');

  Value = require('../value');

  OldDisplayFlex = (function(superClass) {
    extend(OldDisplayFlex, superClass);

    function OldDisplayFlex(unprefixed, prefixed1) {
      this.unprefixed = unprefixed;
      this.prefixed = prefixed1;
    }

    OldDisplayFlex.prototype.check = function(value) {
      return value === this.name;
    };

    return OldDisplayFlex;

  })(OldValue);

  DisplayFlex = (function(superClass) {
    extend(DisplayFlex, superClass);

    DisplayFlex.names = ['display-flex', 'inline-flex'];

    function DisplayFlex(name, prefixes) {
      DisplayFlex.__super__.constructor.apply(this, arguments);
      if (name === 'display-flex') {
        this.name = 'flex';
      }
    }

    DisplayFlex.prototype.check = function(decl) {
      return decl.value === this.name;
    };

    DisplayFlex.prototype.prefixed = function(prefix) {
      var ref, spec;
      ref = flexSpec(prefix), spec = ref[0], prefix = ref[1];
      return prefix + (spec === 2009 ? this.name === 'flex' ? 'box' : 'inline-box' : spec === 2012 ? this.name === 'flex' ? 'flexbox' : 'inline-flexbox' : spec === 'final' ? this.name : void 0);
    };

    DisplayFlex.prototype.replace = function(string, prefix) {
      return this.prefixed(prefix);
    };

    DisplayFlex.prototype.old = function(prefix) {
      var prefixed;
      prefixed = this.prefixed(prefix);
      if (prefixed) {
        return new OldValue(this.name, prefixed);
      }
    };

    return DisplayFlex;

  })(Value);

  module.exports = DisplayFlex;

}).call(this);

},{"../old-value":48,"../value":56,"./flex-spec":32}],24:[function(require,module,exports){
(function() {
  var FillAvailable, OldValue, Value,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  OldValue = require('../old-value');

  Value = require('../value');

  FillAvailable = (function(superClass) {
    extend(FillAvailable, superClass);

    function FillAvailable() {
      return FillAvailable.__super__.constructor.apply(this, arguments);
    }

    FillAvailable.names = ['fill-available'];

    FillAvailable.prototype.replace = function(string, prefix) {
      if (prefix === '-moz-') {
        return string.replace(this.regexp(), '$1-moz-available$3');
      } else {
        return FillAvailable.__super__.replace.apply(this, arguments);
      }
    };

    FillAvailable.prototype.old = function(prefix) {
      if (prefix === '-moz-') {
        return new OldValue(this.name, '-moz-available');
      } else {
        return FillAvailable.__super__.old.apply(this, arguments);
      }
    };

    return FillAvailable;

  })(Value);

  module.exports = FillAvailable;

}).call(this);

},{"../old-value":48,"../value":56}],25:[function(require,module,exports){
(function() {
  var FilterValue, OldFilterValue, OldValue, Value, utils,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  OldValue = require('../old-value');

  Value = require('../value');

  utils = require('../utils');

  OldFilterValue = (function(superClass) {
    extend(OldFilterValue, superClass);

    function OldFilterValue() {
      return OldFilterValue.__super__.constructor.apply(this, arguments);
    }

    OldFilterValue.prototype.clean = function(decl) {
      return decl.value = utils.editList(decl.value, (function(_this) {
        return function(props) {
          if (props.every(function(i) {
            return i.indexOf(_this.unprefixed) !== 0;
          })) {
            return props;
          }
          return props.filter(function(i) {
            return i.indexOf(_this.prefixed) === -1;
          });
        };
      })(this));
    };

    return OldFilterValue;

  })(OldValue);

  FilterValue = (function(superClass) {
    extend(FilterValue, superClass);

    function FilterValue() {
      return FilterValue.__super__.constructor.apply(this, arguments);
    }

    FilterValue.names = ['filter'];

    FilterValue.prototype.replace = function(value, prefix) {
      if (prefix === '-webkit-') {
        if (value.indexOf('-webkit-filter') === -1) {
          return FilterValue.__super__.replace.apply(this, arguments) + ', ' + value;
        } else {
          return value;
        }
      } else {
        return FilterValue.__super__.replace.apply(this, arguments);
      }
    };

    FilterValue.prototype.old = function(prefix) {
      return new OldFilterValue(this.name, prefix + this.name);
    };

    return FilterValue;

  })(Value);

  module.exports = FilterValue;

}).call(this);

},{"../old-value":48,"../utils":55,"../value":56}],26:[function(require,module,exports){
(function() {
  var Declaration, Filter,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  Declaration = require('../declaration');

  Filter = (function(superClass) {
    extend(Filter, superClass);

    function Filter() {
      return Filter.__super__.constructor.apply(this, arguments);
    }

    Filter.names = ['filter'];

    Filter.prototype.check = function(decl) {
      var v;
      v = decl.value;
      return v.toLowerCase().indexOf('alpha(') === -1 && v.indexOf('DXImageTransform.Microsoft') === -1 && v.indexOf('data:image/svg+xml') === -1;
    };

    return Filter;

  })(Declaration);

  module.exports = Filter;

}).call(this);

},{"../declaration":13}],27:[function(require,module,exports){
(function() {
  var Declaration, FlexBasis, flexSpec,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  flexSpec = require('./flex-spec');

  Declaration = require('../declaration');

  FlexBasis = (function(superClass) {
    extend(FlexBasis, superClass);

    function FlexBasis() {
      return FlexBasis.__super__.constructor.apply(this, arguments);
    }

    FlexBasis.names = ['flex-basis', 'flex-preferred-size'];

    FlexBasis.prototype.normalize = function() {
      return 'flex-basis';
    };

    FlexBasis.prototype.prefixed = function(prop, prefix) {
      var ref, spec;
      ref = flexSpec(prefix), spec = ref[0], prefix = ref[1];
      if (spec === 2012) {
        return prefix + 'flex-preferred-size';
      } else {
        return FlexBasis.__super__.prefixed.apply(this, arguments);
      }
    };

    FlexBasis.prototype.set = function(decl, prefix) {
      var ref, spec;
      ref = flexSpec(prefix), spec = ref[0], prefix = ref[1];
      if (spec === 2012 || spec === 'final') {
        return FlexBasis.__super__.set.apply(this, arguments);
      }
    };

    return FlexBasis;

  })(Declaration);

  module.exports = FlexBasis;

}).call(this);

},{"../declaration":13,"./flex-spec":32}],28:[function(require,module,exports){
(function() {
  var Declaration, FlexDirection, flexSpec,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  flexSpec = require('./flex-spec');

  Declaration = require('../declaration');

  FlexDirection = (function(superClass) {
    extend(FlexDirection, superClass);

    function FlexDirection() {
      return FlexDirection.__super__.constructor.apply(this, arguments);
    }

    FlexDirection.names = ['flex-direction', 'box-direction', 'box-orient'];

    FlexDirection.prototype.normalize = function(prop) {
      return 'flex-direction';
    };

    FlexDirection.prototype.insert = function(decl, prefix, prefixes) {
      var already, cloned, dir, orient, ref, spec, value;
      ref = flexSpec(prefix), spec = ref[0], prefix = ref[1];
      if (spec === 2009) {
        already = decl.parent.some(function(i) {
          return i.prop === prefix + 'box-orient' || i.prop === prefix + 'box-direction';
        });
        if (already) {
          return;
        }
        value = decl.value;
        orient = value.indexOf('row') !== -1 ? 'horizontal' : 'vertical';
        dir = value.indexOf('reverse') !== -1 ? 'reverse' : 'normal';
        cloned = this.clone(decl);
        cloned.prop = prefix + 'box-orient';
        cloned.value = orient;
        if (this.needCascade(decl)) {
          cloned.before = this.calcBefore(prefixes, decl, prefix);
        }
        decl.parent.insertBefore(decl, cloned);
        cloned = this.clone(decl);
        cloned.prop = prefix + 'box-direction';
        cloned.value = dir;
        if (this.needCascade(decl)) {
          cloned.before = this.calcBefore(prefixes, decl, prefix);
        }
        return decl.parent.insertBefore(decl, cloned);
      } else {
        return FlexDirection.__super__.insert.apply(this, arguments);
      }
    };

    FlexDirection.prototype.old = function(prop, prefix) {
      var ref, spec;
      ref = flexSpec(prefix), spec = ref[0], prefix = ref[1];
      if (spec === 2009) {
        return [prefix + 'box-orient', prefix + 'box-direction'];
      } else {
        return FlexDirection.__super__.old.apply(this, arguments);
      }
    };

    return FlexDirection;

  })(Declaration);

  module.exports = FlexDirection;

}).call(this);

},{"../declaration":13,"./flex-spec":32}],29:[function(require,module,exports){
(function() {
  var Declaration, FlexFlow, flexSpec,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  flexSpec = require('./flex-spec');

  Declaration = require('../declaration');

  FlexFlow = (function(superClass) {
    extend(FlexFlow, superClass);

    function FlexFlow() {
      return FlexFlow.__super__.constructor.apply(this, arguments);
    }

    FlexFlow.names = ['flex-flow'];

    FlexFlow.prototype.set = function(decl, prefix) {
      var ref, spec;
      ref = flexSpec(prefix), spec = ref[0], prefix = ref[1];
      if (spec === 2012) {
        return FlexFlow.__super__.set.apply(this, arguments);
      } else if (spec === 'final') {
        return FlexFlow.__super__.set.apply(this, arguments);
      }
    };

    return FlexFlow;

  })(Declaration);

  module.exports = FlexFlow;

}).call(this);

},{"../declaration":13,"./flex-spec":32}],30:[function(require,module,exports){
(function() {
  var Declaration, Flex, flexSpec,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  flexSpec = require('./flex-spec');

  Declaration = require('../declaration');

  Flex = (function(superClass) {
    extend(Flex, superClass);

    function Flex() {
      return Flex.__super__.constructor.apply(this, arguments);
    }

    Flex.names = ['flex-grow', 'flex-positive'];

    Flex.prototype.normalize = function() {
      return 'flex';
    };

    Flex.prototype.prefixed = function(prop, prefix) {
      var ref, spec;
      ref = flexSpec(prefix), spec = ref[0], prefix = ref[1];
      if (spec === 2009) {
        return prefix + 'box-flex';
      } else if (spec === 2012) {
        return prefix + 'flex-positive';
      } else {
        return Flex.__super__.prefixed.apply(this, arguments);
      }
    };

    return Flex;

  })(Declaration);

  module.exports = Flex;

}).call(this);

},{"../declaration":13,"./flex-spec":32}],31:[function(require,module,exports){
(function() {
  var Declaration, FlexShrink, flexSpec,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  flexSpec = require('./flex-spec');

  Declaration = require('../declaration');

  FlexShrink = (function(superClass) {
    extend(FlexShrink, superClass);

    function FlexShrink() {
      return FlexShrink.__super__.constructor.apply(this, arguments);
    }

    FlexShrink.names = ['flex-shrink', 'flex-negative'];

    FlexShrink.prototype.normalize = function() {
      return 'flex-shrink';
    };

    FlexShrink.prototype.prefixed = function(prop, prefix) {
      var ref, spec;
      ref = flexSpec(prefix), spec = ref[0], prefix = ref[1];
      if (spec === 2012) {
        return prefix + 'flex-negative';
      } else {
        return FlexShrink.__super__.prefixed.apply(this, arguments);
      }
    };

    FlexShrink.prototype.set = function(decl, prefix) {
      var ref, spec;
      ref = flexSpec(prefix), spec = ref[0], prefix = ref[1];
      if (spec === 2012 || spec === 'final') {
        return FlexShrink.__super__.set.apply(this, arguments);
      }
    };

    return FlexShrink;

  })(Declaration);

  module.exports = FlexShrink;

}).call(this);

},{"../declaration":13,"./flex-spec":32}],32:[function(require,module,exports){
(function() {
  module.exports = function(prefix) {
    var spec;
    spec = prefix === '-webkit- 2009' || prefix === '-moz-' ? 2009 : prefix === '-ms-' ? 2012 : prefix === '-webkit-' ? 'final' : void 0;
    if (prefix === '-webkit- 2009') {
      prefix = '-webkit-';
    }
    return [spec, prefix];
  };

}).call(this);

},{}],33:[function(require,module,exports){
(function() {
  var FlexValues, OldValue, Value,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  OldValue = require('../old-value');

  Value = require('../value');

  FlexValues = (function(superClass) {
    extend(FlexValues, superClass);

    function FlexValues() {
      return FlexValues.__super__.constructor.apply(this, arguments);
    }

    FlexValues.names = ['flex', 'flex-grow', 'flex-shrink', 'flex-basis'];

    FlexValues.prototype.prefixed = function(prefix) {
      return this.all.prefixed(this.name, prefix);
    };

    FlexValues.prototype.replace = function(string, prefix) {
      return string.replace(this.regexp(), '$1' + this.prefixed(prefix) + '$3');
    };

    FlexValues.prototype.old = function(prefix) {
      return new OldValue(this.name, this.prefixed(prefix));
    };

    return FlexValues;

  })(Value);

  module.exports = FlexValues;

}).call(this);

},{"../old-value":48,"../value":56}],34:[function(require,module,exports){
(function() {
  var Declaration, FlexWrap, flexSpec,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  flexSpec = require('./flex-spec');

  Declaration = require('../declaration');

  FlexWrap = (function(superClass) {
    extend(FlexWrap, superClass);

    function FlexWrap() {
      return FlexWrap.__super__.constructor.apply(this, arguments);
    }

    FlexWrap.names = ['flex-wrap'];

    FlexWrap.prototype.set = function(decl, prefix) {
      var spec;
      spec = flexSpec(prefix)[0];
      if (spec !== 2009) {
        return FlexWrap.__super__.set.apply(this, arguments);
      }
    };

    return FlexWrap;

  })(Declaration);

  module.exports = FlexWrap;

}).call(this);

},{"../declaration":13,"./flex-spec":32}],35:[function(require,module,exports){
(function() {
  var Declaration, Flex, flexSpec, list,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  flexSpec = require('./flex-spec');

  Declaration = require('../declaration');

  list = require('postcss/lib/list');

  Flex = (function(superClass) {
    extend(Flex, superClass);

    function Flex() {
      return Flex.__super__.constructor.apply(this, arguments);
    }

    Flex.names = ['flex', 'box-flex'];

    Flex.oldValues = {
      'auto': '1',
      'none': '0'
    };

    Flex.prototype.prefixed = function(prop, prefix) {
      var ref, spec;
      ref = flexSpec(prefix), spec = ref[0], prefix = ref[1];
      if (spec === 2009) {
        return prefix + 'box-flex';
      } else {
        return Flex.__super__.prefixed.apply(this, arguments);
      }
    };

    Flex.prototype.normalize = function() {
      return 'flex';
    };

    Flex.prototype.set = function(decl, prefix) {
      var spec;
      spec = flexSpec(prefix)[0];
      if (spec === 2009) {
        decl.value = list.space(decl.value)[0];
        decl.value = Flex.oldValues[decl.value] || decl.value;
        return Flex.__super__.set.call(this, decl, prefix);
      } else {
        return Flex.__super__.set.apply(this, arguments);
      }
    };

    return Flex;

  })(Declaration);

  module.exports = Flex;

}).call(this);

},{"../declaration":13,"./flex-spec":32,"postcss/lib/list":147}],36:[function(require,module,exports){
(function() {
  var Fullscreen, Selector,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  Selector = require('../selector');

  Fullscreen = (function(superClass) {
    extend(Fullscreen, superClass);

    function Fullscreen() {
      return Fullscreen.__super__.constructor.apply(this, arguments);
    }

    Fullscreen.names = [':fullscreen'];

    Fullscreen.prototype.prefixed = function(prefix) {
      if ('-webkit-' === prefix) {
        return ':-webkit-full-screen';
      } else if ('-moz-' === prefix) {
        return ':-moz-full-screen';
      } else {
        return ":" + prefix + "fullscreen";
      }
    };

    return Fullscreen;

  })(Selector);

  module.exports = Fullscreen;

}).call(this);

},{"../selector":53}],37:[function(require,module,exports){
(function() {
  var Gradient, OldValue, Value, isDirection, list, utils,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  OldValue = require('../old-value');

  Value = require('../value');

  utils = require('../utils');

  list = require('postcss/lib/list');

  isDirection = /top|left|right|bottom/gi;

  Gradient = (function(superClass) {
    extend(Gradient, superClass);

    function Gradient() {
      return Gradient.__super__.constructor.apply(this, arguments);
    }

    Gradient.names = ['linear-gradient', 'repeating-linear-gradient', 'radial-gradient', 'repeating-radial-gradient'];

    Gradient.prototype.replace = function(string, prefix) {
      return list.space(string).map((function(_this) {
        return function(value) {
          var after, args, close, params;
          if (value.slice(0, +_this.name.length + 1 || 9e9) !== _this.name + '(') {
            return value;
          }
          close = value.lastIndexOf(')');
          after = value.slice(close + 1);
          args = value.slice(_this.name.length + 1, +(close - 1) + 1 || 9e9);
          params = list.comma(args);
          params = _this.newDirection(params);
          if (prefix === '-webkit- old') {
            return _this.oldWebkit(value, args, params, after);
          } else {
            _this.convertDirection(params);
            return prefix + _this.name + '(' + params.join(', ') + ')' + after;
          }
        };
      })(this)).join(' ');
    };

    Gradient.prototype.directions = {
      top: 'bottom',
      left: 'right',
      bottom: 'top',
      right: 'left'
    };

    Gradient.prototype.oldDirections = {
      'top': 'left bottom, left top',
      'left': 'right top, left top',
      'bottom': 'left top, left bottom',
      'right': 'left top, right top',
      'top right': 'left bottom, right top',
      'top left': 'right bottom, left top',
      'right top': 'left bottom, right top',
      'right bottom': 'left top, right bottom',
      'bottom right': 'left top, right bottom',
      'bottom left': 'right top, left bottom',
      'left top': 'right bottom, left top',
      'left bottom': 'right top, left bottom'
    };

    Gradient.prototype.newDirection = function(params) {
      var first, value;
      first = params[0];
      if (first.indexOf('to ') === -1 && isDirection.test(first)) {
        first = first.split(' ');
        first = (function() {
          var j, len, results;
          results = [];
          for (j = 0, len = first.length; j < len; j++) {
            value = first[j];
            results.push(this.directions[value.toLowerCase()] || value);
          }
          return results;
        }).call(this);
        params[0] = 'to ' + first.join(' ');
      }
      return params;
    };

    Gradient.prototype.oldWebkit = function(value, args, params, after) {
      if (args.indexOf('px') !== -1) {
        return value;
      }
      if (this.name !== 'linear-gradient') {
        return value;
      }
      if (params[0] && params[0].indexOf('deg') !== -1) {
        return value;
      }
      if (args.indexOf('-corner') !== -1) {
        return value;
      }
      if (args.indexOf('-side') !== -1) {
        return value;
      }
      params = this.oldDirection(params);
      params = this.colorStops(params);
      return '-webkit-gradient(linear, ' + params.join(', ') + ')' + after;
    };

    Gradient.prototype.convertDirection = function(params) {
      if (params.length > 0) {
        if (params[0].slice(0, 3) === 'to ') {
          return params[0] = this.fixDirection(params[0]);
        } else if (params[0].indexOf('deg') !== -1) {
          return params[0] = this.fixAngle(params[0]);
        } else if (params[0].indexOf(' at ') !== -1) {
          return this.fixRadial(params);
        }
      }
    };

    Gradient.prototype.fixDirection = function(param) {
      var value;
      param = param.split(' ');
      param.splice(0, 1);
      param = (function() {
        var j, len, results;
        results = [];
        for (j = 0, len = param.length; j < len; j++) {
          value = param[j];
          results.push(this.directions[value.toLowerCase()] || value);
        }
        return results;
      }).call(this);
      return param.join(' ');
    };

    Gradient.prototype.roundFloat = function(float, digits) {
      return parseFloat(float.toFixed(digits));
    };

    Gradient.prototype.fixAngle = function(param) {
      param = parseFloat(param);
      param = Math.abs(450 - param) % 360;
      param = this.roundFloat(param, 3);
      return param + "deg";
    };

    Gradient.prototype.oldDirection = function(params) {
      var direction;
      if (params.length === 0) {
        params;
      }
      if (params[0].indexOf('to ') !== -1) {
        direction = params[0].replace(/^to\s+/, '');
        direction = this.oldDirections[direction];
        params[0] = direction;
        return params;
      } else {
        direction = this.oldDirections.bottom;
        return [direction].concat(params);
      }
    };

    Gradient.prototype.colorStops = function(params) {
      return params.map(function(param, i) {
        var color, match, position, ref;
        if (i === 0) {
          return param;
        }
        ref = list.space(param), color = ref[0], position = ref[1];
        if (position == null) {
          match = param.match(/^(.*\))(\d.*)$/);
          if (match) {
            color = match[1];
            position = match[2];
          }
        }
        if (position && position.indexOf(')') !== -1) {
          color += ' ' + position;
          position = void 0;
        }
        if (i === 1 && (position === void 0 || position === '0%')) {
          return "from(" + color + ")";
        } else if (i === params.length - 1 && (position === void 0 || position === '100%')) {
          return "to(" + color + ")";
        } else if (position) {
          return "color-stop(" + position + ", " + color + ")";
        } else {
          return "color-stop(" + color + ")";
        }
      });
    };

    Gradient.prototype.fixRadial = function(params) {
      var first;
      first = params[0].split(/\s+at\s+/);
      return params.splice(0, 1, first[1], first[0]);
    };

    Gradient.prototype.old = function(prefix) {
      var regexp, string, type;
      if (prefix === '-webkit-') {
        type = this.name === 'linear-gradient' ? 'linear' : 'radial';
        string = '-gradient';
        regexp = utils.regexp("-webkit-(" + type + "-gradient|gradient\\(\\s*" + type + ")", false);
        return new OldValue(this.name, prefix + this.name, string, regexp);
      } else {
        return Gradient.__super__.old.apply(this, arguments);
      }
    };

    Gradient.prototype.add = function(decl, prefix) {
      var p;
      p = decl.prop;
      if (p.indexOf('mask') !== -1) {
        if (prefix === '-webkit-' || prefix === '-webkit- old') {
          return Gradient.__super__.add.apply(this, arguments);
        }
      } else if (p === 'list-style' || p === 'list-style-image' || p === 'content') {
        if (prefix === '-webkit-' || prefix === '-webkit- old') {
          return Gradient.__super__.add.apply(this, arguments);
        }
      } else {
        return Gradient.__super__.add.apply(this, arguments);
      }
    };

    Gradient.prototype.process = function(node, result) {
      var added;
      added = Gradient.__super__.process.apply(this, arguments);
      if (added && this.name === 'linear-gradient') {
        if (/\(\s*(top|left|right|bottom)/.test(node.value)) {
          result.warn('Gradient has outdated direction syntax. ' + 'New syntax is like "to left" instead of "right".', {
            node: node
          });
        }
      }
      return added;
    };

    return Gradient;

  })(Value);

  module.exports = Gradient;

}).call(this);

},{"../old-value":48,"../utils":55,"../value":56,"postcss/lib/list":147}],38:[function(require,module,exports){
(function() {
  var Declaration, ImageRendering,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  Declaration = require('../declaration');

  ImageRendering = (function(superClass) {
    extend(ImageRendering, superClass);

    function ImageRendering() {
      return ImageRendering.__super__.constructor.apply(this, arguments);
    }

    ImageRendering.names = ['image-rendering', 'interpolation-mode'];

    ImageRendering.prototype.check = function(decl) {
      return decl.value === 'pixelated';
    };

    ImageRendering.prototype.prefixed = function(prop, prefix) {
      if (prefix === '-ms-') {
        return '-ms-interpolation-mode';
      } else {
        return ImageRendering.__super__.prefixed.apply(this, arguments);
      }
    };

    ImageRendering.prototype.set = function(decl, prefix) {
      if (prefix === '-ms-') {
        decl.prop = '-ms-interpolation-mode';
        decl.value = 'nearest-neighbor';
        return decl;
      } else {
        return ImageRendering.__super__.set.apply(this, arguments);
      }
    };

    ImageRendering.prototype.normalize = function(prop) {
      return 'image-rendering';
    };

    ImageRendering.prototype.process = function(node, result) {
      if (this.name === 'image-rendering' && node.value === 'crisp-edges') {
        result.warn('There is no browsers with crisp-edges rendering support.' + 'Maybe you mean pixelated?', {
          node: node
        });
      }
      return ImageRendering.__super__.process.apply(this, arguments);
    };

    return ImageRendering;

  })(Declaration);

  module.exports = ImageRendering;

}).call(this);

},{"../declaration":13}],39:[function(require,module,exports){
(function() {
  var Declaration, InlineLogical,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  Declaration = require('../declaration');

  InlineLogical = (function(superClass) {
    extend(InlineLogical, superClass);

    function InlineLogical() {
      return InlineLogical.__super__.constructor.apply(this, arguments);
    }

    InlineLogical.names = ['border-inline-start', 'border-inline-end', 'margin-inline-start', 'margin-inline-end', 'padding-inline-start', 'padding-inline-end', 'border-start', 'border-end', 'margin-start', 'margin-end', 'padding-start', 'padding-end'];

    InlineLogical.prototype.prefixed = function(prop, prefix) {
      return prefix + prop.replace('-inline', '');
    };

    InlineLogical.prototype.normalize = function(prop) {
      return prop.replace(/(margin|padding|border)-(start|end)/, '$1-inline-$2');
    };

    return InlineLogical;

  })(Declaration);

  module.exports = InlineLogical;

}).call(this);

},{"../declaration":13}],40:[function(require,module,exports){
(function() {
  var Declaration, JustifyContent, flexSpec,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  flexSpec = require('./flex-spec');

  Declaration = require('../declaration');

  JustifyContent = (function(superClass) {
    extend(JustifyContent, superClass);

    function JustifyContent() {
      return JustifyContent.__super__.constructor.apply(this, arguments);
    }

    JustifyContent.names = ['justify-content', 'flex-pack', 'box-pack'];

    JustifyContent.oldValues = {
      'flex-end': 'end',
      'flex-start': 'start',
      'space-between': 'justify',
      'space-around': 'distribute'
    };

    JustifyContent.prototype.prefixed = function(prop, prefix) {
      var ref, spec;
      ref = flexSpec(prefix), spec = ref[0], prefix = ref[1];
      if (spec === 2009) {
        return prefix + 'box-pack';
      } else if (spec === 2012) {
        return prefix + 'flex-pack';
      } else {
        return JustifyContent.__super__.prefixed.apply(this, arguments);
      }
    };

    JustifyContent.prototype.normalize = function(prop) {
      return 'justify-content';
    };

    JustifyContent.prototype.set = function(decl, prefix) {
      var spec, value;
      spec = flexSpec(prefix)[0];
      if (spec === 2009 || spec === 2012) {
        value = JustifyContent.oldValues[decl.value] || decl.value;
        decl.value = value;
        if (spec !== 2009 || value !== 'distribute') {
          return JustifyContent.__super__.set.call(this, decl, prefix);
        }
      } else if (spec === 'final') {
        return JustifyContent.__super__.set.apply(this, arguments);
      }
    };

    return JustifyContent;

  })(Declaration);

  module.exports = JustifyContent;

}).call(this);

},{"../declaration":13,"./flex-spec":32}],41:[function(require,module,exports){
(function() {
  var Declaration, Order, flexSpec,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  flexSpec = require('./flex-spec');

  Declaration = require('../declaration');

  Order = (function(superClass) {
    extend(Order, superClass);

    function Order() {
      return Order.__super__.constructor.apply(this, arguments);
    }

    Order.names = ['order', 'flex-order', 'box-ordinal-group'];

    Order.prototype.prefixed = function(prop, prefix) {
      var ref, spec;
      ref = flexSpec(prefix), spec = ref[0], prefix = ref[1];
      if (spec === 2009) {
        return prefix + 'box-ordinal-group';
      } else if (spec === 2012) {
        return prefix + 'flex-order';
      } else {
        return Order.__super__.prefixed.apply(this, arguments);
      }
    };

    Order.prototype.normalize = function(prop) {
      return 'order';
    };

    Order.prototype.set = function(decl, prefix) {
      var spec;
      spec = flexSpec(prefix)[0];
      if (spec === 2009) {
        decl.value = (parseInt(decl.value) + 1).toString();
        return Order.__super__.set.call(this, decl, prefix);
      } else {
        return Order.__super__.set.apply(this, arguments);
      }
    };

    return Order;

  })(Declaration);

  module.exports = Order;

}).call(this);

},{"../declaration":13,"./flex-spec":32}],42:[function(require,module,exports){
(function() {
  var Pixelated, Value,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  Value = require('../value');

  Pixelated = (function(superClass) {
    extend(Pixelated, superClass);

    function Pixelated() {
      return Pixelated.__super__.constructor.apply(this, arguments);
    }

    Pixelated.names = ['pixelated'];

    Pixelated.prototype.replace = function(string, prefix) {
      if (prefix === '-webkit-') {
        return string.replace(this.regexp(), '$1-webkit-optimize-contrast');
      } else if (prefix === '-moz-') {
        return string.replace(this.regexp(), '$1-moz-crisp-edges');
      } else {
        return Pixelated.__super__.replace.apply(this, arguments);
      }
    };

    return Pixelated;

  })(Value);

  module.exports = Pixelated;

}).call(this);

},{"../value":56}],43:[function(require,module,exports){
(function() {
  var Placeholder, Selector,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  Selector = require('../selector');

  Placeholder = (function(superClass) {
    extend(Placeholder, superClass);

    function Placeholder() {
      return Placeholder.__super__.constructor.apply(this, arguments);
    }

    Placeholder.names = [':placeholder-shown', '::placeholder'];

    Placeholder.prototype.possible = function() {
      return Placeholder.__super__.possible.apply(this, arguments).concat('-moz- old');
    };

    Placeholder.prototype.prefixed = function(prefix) {
      if ('-webkit-' === prefix) {
        return '::-webkit-input-placeholder';
      } else if ('-ms-' === prefix) {
        return ':-ms-input-placeholder';
      } else if ('-moz- old' === prefix) {
        return ':-moz-placeholder';
      } else {
        return "::" + prefix + "placeholder";
      }
    };

    return Placeholder;

  })(Selector);

  module.exports = Placeholder;

}).call(this);

},{"../selector":53}],44:[function(require,module,exports){
(function() {
  var Declaration, TransformDecl,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  Declaration = require('../declaration');

  TransformDecl = (function(superClass) {
    extend(TransformDecl, superClass);

    function TransformDecl() {
      return TransformDecl.__super__.constructor.apply(this, arguments);
    }

    TransformDecl.names = ['transform', 'transform-origin'];

    TransformDecl.functions3d = ['matrix3d', 'translate3d', 'translateZ', 'scale3d', 'scaleZ', 'rotate3d', 'rotateX', 'rotateY', 'rotateZ', 'perspective'];

    TransformDecl.prototype.keykrameParents = function(decl) {
      var parent;
      parent = decl.parent;
      while (parent) {
        if (parent.type === 'atrule' && parent.name === 'keyframes') {
          return true;
        }
        parent = parent.parent;
      }
      return false;
    };

    TransformDecl.prototype.contain3d = function(decl) {
      var func, i, len, ref;
      if (decl.prop === 'transform-origin') {
        return false;
      }
      ref = TransformDecl.functions3d;
      for (i = 0, len = ref.length; i < len; i++) {
        func = ref[i];
        if (decl.value.indexOf(func + "(") !== -1) {
          return true;
        }
      }
      return false;
    };

    TransformDecl.prototype.insert = function(decl, prefix, prefixes) {
      if (prefix === '-ms-') {
        if (!this.contain3d(decl) && !this.keykrameParents(decl)) {
          return TransformDecl.__super__.insert.apply(this, arguments);
        }
      } else if (prefix === '-o-') {
        if (!this.contain3d(decl)) {
          return TransformDecl.__super__.insert.apply(this, arguments);
        }
      } else {
        return TransformDecl.__super__.insert.apply(this, arguments);
      }
    };

    return TransformDecl;

  })(Declaration);

  module.exports = TransformDecl;

}).call(this);

},{"../declaration":13}],45:[function(require,module,exports){
(function() {
  var TransformValue, Value,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  Value = require('../value');

  TransformValue = (function(superClass) {
    extend(TransformValue, superClass);

    function TransformValue() {
      return TransformValue.__super__.constructor.apply(this, arguments);
    }

    TransformValue.names = ['transform'];

    TransformValue.prototype.replace = function(value, prefix) {
      if (prefix === '-ms-') {
        return value;
      } else {
        return TransformValue.__super__.replace.apply(this, arguments);
      }
    };

    return TransformValue;

  })(Value);

  module.exports = TransformValue;

}).call(this);

},{"../value":56}],46:[function(require,module,exports){
(function() {
  var capitalize, names, prefix;

  capitalize = function(str) {
    return str.slice(0, 1).toUpperCase() + str.slice(1);
  };

  names = {
    ie: 'IE',
    ie_mob: 'IE Mobile',
    ios_saf: 'iOS',
    op_mini: 'Opera Mini',
    op_mob: 'Opera Mobile',
    and_chr: 'Chrome for Android',
    and_ff: 'Firefox for Android',
    and_uc: 'UC for Android'
  };

  prefix = function(name, transition, prefixes) {
    var out;
    out = '  ' + name + (transition ? '*' : '') + ': ';
    out += prefixes.map(function(i) {
      return i.replace(/^-(.*)-$/g, '$1');
    }).join(', ');
    out += "\n";
    return out;
  };

  module.exports = function(prefixes) {
    var atrules, browser, data, j, k, l, len, len1, len2, list, name, needTransition, out, props, ref, ref1, ref2, ref3, ref4, ref5, ref6, selector, selectors, string, transitionProp, useTransition, value, values, version, versions;
    if (prefixes.browsers.selected.length === 0) {
      return "No browsers selected";
    }
    versions = [];
    ref = prefixes.browsers.selected;
    for (j = 0, len = ref.length; j < len; j++) {
      browser = ref[j];
      ref1 = browser.split(' '), name = ref1[0], version = ref1[1];
      name = names[name] || capitalize(name);
      if (versions[name]) {
        versions[name].push(version);
      } else {
        versions[name] = [version];
      }
    }
    out = "Browsers:\n";
    for (browser in versions) {
      list = versions[browser];
      list = list.sort(function(a, b) {
        return parseFloat(b) - parseFloat(a);
      });
      out += '  ' + browser + ': ' + list.join(', ') + "\n";
    }
    atrules = '';
    ref2 = prefixes.add;
    for (name in ref2) {
      data = ref2[name];
      if (name[0] === '@' && data.prefixes) {
        atrules += prefix(name, false, data.prefixes);
      }
    }
    if (atrules !== '') {
      out += "\nAt-Rules:\n" + atrules;
    }
    selectors = '';
    ref3 = prefixes.add.selectors;
    for (k = 0, len1 = ref3.length; k < len1; k++) {
      selector = ref3[k];
      if (selector.prefixes) {
        selectors += prefix(selector.name, false, selector.prefixes);
      }
    }
    if (selectors !== '') {
      out += "\nSelectors:\n" + selectors;
    }
    values = '';
    props = '';
    useTransition = false;
    needTransition = (ref4 = prefixes.add.transition) != null ? ref4.prefixes : void 0;
    ref5 = prefixes.add;
    for (name in ref5) {
      data = ref5[name];
      if (name[0] !== '@' && data.prefixes) {
        transitionProp = needTransition && prefixes.data[name].transition;
        if (transitionProp) {
          useTransition = true;
        }
        props += prefix(name, transitionProp, data.prefixes);
      }
      if (!data.values) {
        continue;
      }
      if (prefixes.transitionProps.some(function(i) {
        return i === name;
      })) {
        continue;
      }
      ref6 = data.values;
      for (l = 0, len2 = ref6.length; l < len2; l++) {
        value = ref6[l];
        string = prefix(value.name, false, value.prefixes);
        if (values.indexOf(string) === -1) {
          values += string;
        }
      }
    }
    if (useTransition) {
      props += "  * - can be used in transition\n";
    }
    if (props !== '') {
      out += "\nProperties:\n" + props;
    }
    if (values !== '') {
      out += "\nValues:\n" + values;
    }
    if (atrules === '' && selectors === '' && props === '' && values === '') {
      out += '\nAwesome! Your browsers don\'t require any vendor prefixes.' + '\nNow you can remove Autoprefixer from build steps.';
    }
    return out;
  };

}).call(this);

},{}],47:[function(require,module,exports){
(function() {
  var OldSelector;

  OldSelector = (function() {
    function OldSelector(selector, prefix1) {
      var i, len, prefix, ref;
      this.prefix = prefix1;
      this.prefixed = selector.prefixed(this.prefix);
      this.regexp = selector.regexp(this.prefix);
      this.prefixeds = [];
      ref = selector.possible();
      for (i = 0, len = ref.length; i < len; i++) {
        prefix = ref[i];
        this.prefixeds.push([selector.prefixed(prefix), selector.regexp(prefix)]);
      }
      this.unprefixed = selector.name;
      this.nameRegexp = selector.regexp();
    }

    OldSelector.prototype.isHack = function(rule) {
      var before, i, index, len, ref, ref1, regexp, rules, some, string;
      index = rule.parent.index(rule) + 1;
      rules = rule.parent.nodes;
      while (index < rules.length) {
        before = rules[index].selector;
        if (!before) {
          return true;
        }
        if (before.indexOf(this.unprefixed) !== -1 && before.match(this.nameRegexp)) {
          return false;
        }
        some = false;
        ref = this.prefixeds;
        for (i = 0, len = ref.length; i < len; i++) {
          ref1 = ref[i], string = ref1[0], regexp = ref1[1];
          if (before.indexOf(string) !== -1 && before.match(regexp)) {
            some = true;
            break;
          }
        }
        if (!some) {
          return true;
        }
        index += 1;
      }
      return true;
    };

    OldSelector.prototype.check = function(rule) {
      if (rule.selector.indexOf(this.prefixed) === -1) {
        return false;
      }
      if (!rule.selector.match(this.regexp)) {
        return false;
      }
      if (this.isHack(rule)) {
        return false;
      }
      return true;
    };

    return OldSelector;

  })();

  module.exports = OldSelector;

}).call(this);

},{}],48:[function(require,module,exports){
(function() {
  var OldValue, utils;

  utils = require('./utils');

  OldValue = (function() {
    function OldValue(unprefixed, prefixed, string, regexp) {
      this.unprefixed = unprefixed;
      this.prefixed = prefixed;
      this.string = string;
      this.regexp = regexp;
      this.regexp || (this.regexp = utils.regexp(this.prefixed));
      this.string || (this.string = this.prefixed);
    }

    OldValue.prototype.check = function(value) {
      if (value.indexOf(this.string) !== -1) {
        return !!value.match(this.regexp);
      } else {
        return false;
      }
    };

    return OldValue;

  })();

  module.exports = OldValue;

}).call(this);

},{"./utils":55}],49:[function(require,module,exports){
(function() {
  var Browsers, Prefixer, clone, utils, vendor,
    hasProp = {}.hasOwnProperty;

  Browsers = require('./browsers');

  utils = require('./utils');

  vendor = require('postcss/lib/vendor');

  clone = function(obj, parent) {
    var cloned, i, value;
    cloned = new obj.constructor();
    for (i in obj) {
      if (!hasProp.call(obj, i)) continue;
      value = obj[i];
      if (i === 'parent' && typeof value === 'object') {
        if (parent) {
          cloned[i] = parent;
        }
      } else if (i === 'source') {
        cloned[i] = value;
      } else if (value instanceof Array) {
        cloned[i] = value.map(function(i) {
          return clone(i, cloned);
        });
      } else if (i !== '_autoprefixerPrefix' && i !== '_autoprefixerValues') {
        if (typeof value === 'object') {
          value = clone(value, cloned);
        }
        cloned[i] = value;
      }
    }
    return cloned;
  };

  Prefixer = (function() {
    Prefixer.hack = function(klass) {
      var j, len, name, ref, results;
      this.hacks || (this.hacks = {});
      ref = klass.names;
      results = [];
      for (j = 0, len = ref.length; j < len; j++) {
        name = ref[j];
        results.push(this.hacks[name] = klass);
      }
      return results;
    };

    Prefixer.load = function(name, prefixes, all) {
      var klass, ref;
      klass = (ref = this.hacks) != null ? ref[name] : void 0;
      if (klass) {
        return new klass(name, prefixes, all);
      } else {
        return new this(name, prefixes, all);
      }
    };

    Prefixer.clone = function(node, overrides) {
      var cloned, name;
      cloned = clone(node);
      for (name in overrides) {
        cloned[name] = overrides[name];
      }
      return cloned;
    };

    function Prefixer(name1, prefixes1, all1) {
      this.name = name1;
      this.prefixes = prefixes1;
      this.all = all1;
    }

    Prefixer.prototype.parentPrefix = function(node) {
      var prefix;
      prefix = node._autoprefixerPrefix != null ? node._autoprefixerPrefix : node.type === 'decl' && node.prop[0] === '-' ? vendor.prefix(node.prop) : node.type === 'root' ? false : node.type === 'rule' && node.selector.indexOf(':-') !== -1 ? node.selector.match(/:(-\w+-)/)[1] : node.type === 'atrule' && node.name[0] === '-' ? vendor.prefix(node.name) : this.parentPrefix(node.parent);
      if (Browsers.prefixes().indexOf(prefix) === -1) {
        prefix = false;
      }
      return node._autoprefixerPrefix = prefix;
    };

    Prefixer.prototype.process = function(node) {
      var added, j, k, len, len1, parent, prefix, prefixes, ref;
      if (!this.check(node)) {
        return;
      }
      parent = this.parentPrefix(node);
      prefixes = [];
      ref = this.prefixes;
      for (j = 0, len = ref.length; j < len; j++) {
        prefix = ref[j];
        if (parent && parent !== utils.removeNote(prefix)) {
          continue;
        }
        prefixes.push(prefix);
      }
      added = [];
      for (k = 0, len1 = prefixes.length; k < len1; k++) {
        prefix = prefixes[k];
        if (this.add(node, prefix, added.concat([prefix]))) {
          added.push(prefix);
        }
      }
      return added;
    };

    Prefixer.prototype.clone = function(node, overrides) {
      return Prefixer.clone(node, overrides);
    };

    return Prefixer;

  })();

  module.exports = Prefixer;

}).call(this);

},{"./browsers":12,"./utils":55,"postcss/lib/vendor":159}],50:[function(require,module,exports){
(function() {
  var AtRule, Browsers, Declaration, Prefixes, Processor, Resolution, Selector, Supports, Value, declsCache, utils, vendor;

  Declaration = require('./declaration');

  Resolution = require('./resolution');

  Processor = require('./processor');

  Supports = require('./supports');

  Browsers = require('./browsers');

  Selector = require('./selector');

  AtRule = require('./at-rule');

  Value = require('./value');

  utils = require('./utils');

  vendor = require('postcss/lib/vendor');

  Selector.hack(require('./hacks/fullscreen'));

  Selector.hack(require('./hacks/placeholder'));

  Declaration.hack(require('./hacks/flex'));

  Declaration.hack(require('./hacks/order'));

  Declaration.hack(require('./hacks/filter'));

  Declaration.hack(require('./hacks/flex-flow'));

  Declaration.hack(require('./hacks/flex-grow'));

  Declaration.hack(require('./hacks/flex-wrap'));

  Declaration.hack(require('./hacks/appearance'));

  Declaration.hack(require('./hacks/align-self'));

  Declaration.hack(require('./hacks/flex-basis'));

  Declaration.hack(require('./hacks/align-items'));

  Declaration.hack(require('./hacks/flex-shrink'));

  Declaration.hack(require('./hacks/break-inside'));

  Declaration.hack(require('./hacks/border-image'));

  Declaration.hack(require('./hacks/align-content'));

  Declaration.hack(require('./hacks/border-radius'));

  Declaration.hack(require('./hacks/block-logical'));

  Declaration.hack(require('./hacks/inline-logical'));

  Declaration.hack(require('./hacks/transform-decl'));

  Declaration.hack(require('./hacks/flex-direction'));

  Declaration.hack(require('./hacks/image-rendering'));

  Declaration.hack(require('./hacks/justify-content'));

  Declaration.hack(require('./hacks/background-size'));

  Value.hack(require('./hacks/gradient'));

  Value.hack(require('./hacks/pixelated'));

  Value.hack(require('./hacks/flex-values'));

  Value.hack(require('./hacks/display-flex'));

  Value.hack(require('./hacks/filter-value'));

  Value.hack(require('./hacks/fill-available'));

  Value.hack(require('./hacks/transform-value'));

  declsCache = {};

  Prefixes = (function() {
    function Prefixes(data1, browsers, options) {
      var ref;
      this.data = data1;
      this.browsers = browsers;
      this.options = options != null ? options : {};
      ref = this.preprocess(this.select(this.data)), this.add = ref[0], this.remove = ref[1];
      this.processor = new Processor(this);
    }

    Prefixes.prototype.transitionProps = ['transition', 'transition-property'];

    Prefixes.prototype.cleaner = function() {
      var empty;
      if (!this.cleanerCache) {
        if (this.browsers.selected.length) {
          empty = new Browsers(this.browsers.data, []);
          this.cleanerCache = new Prefixes(this.data, empty, this.options);
        } else {
          return this;
        }
      }
      return this.cleanerCache;
    };

    Prefixes.prototype.select = function(list) {
      var add, all, data, name, notes, selected;
      selected = {
        add: {},
        remove: {}
      };
      for (name in list) {
        data = list[name];
        add = data.browsers.map(function(i) {
          var params;
          params = i.split(' ');
          return {
            browser: params[0] + ' ' + params[1],
            note: params[2]
          };
        });
        notes = add.filter(function(i) {
          return i.note;
        }).map((function(_this) {
          return function(i) {
            return _this.browsers.prefix(i.browser) + ' ' + i.note;
          };
        })(this));
        notes = utils.uniq(notes);
        add = add.filter((function(_this) {
          return function(i) {
            return _this.browsers.isSelected(i.browser);
          };
        })(this)).map((function(_this) {
          return function(i) {
            var prefix;
            prefix = _this.browsers.prefix(i.browser);
            if (i.note) {
              return prefix + ' ' + i.note;
            } else {
              return prefix;
            }
          };
        })(this));
        add = this.sort(utils.uniq(add));
        all = data.browsers.map((function(_this) {
          return function(i) {
            return _this.browsers.prefix(i);
          };
        })(this));
        if (data.mistakes) {
          all = all.concat(data.mistakes);
        }
        all = all.concat(notes);
        all = utils.uniq(all);
        if (add.length) {
          selected.add[name] = add;
          if (add.length < all.length) {
            selected.remove[name] = all.filter(function(i) {
              return add.indexOf(i) === -1;
            });
          }
        } else {
          selected.remove[name] = all;
        }
      }
      return selected;
    };

    Prefixes.prototype.sort = function(prefixes) {
      return prefixes.sort(function(a, b) {
        var aLength, bLength;
        aLength = utils.removeNote(a).length;
        bLength = utils.removeNote(b).length;
        if (aLength === bLength) {
          return b.length - a.length;
        } else {
          return bLength - aLength;
        }
      });
    };

    Prefixes.prototype.preprocess = function(selected) {
      var add, j, k, l, len, len1, len2, len3, len4, len5, len6, m, n, name, o, old, olds, p, prefix, prefixed, prefixes, prop, props, ref, ref1, ref2, remove, selector, value, values;
      add = {
        selectors: [],
        '@supports': new Supports(this)
      };
      ref = selected.add;
      for (name in ref) {
        prefixes = ref[name];
        if (name === '@keyframes' || name === '@viewport') {
          add[name] = new AtRule(name, prefixes, this);
        } else if (name === '@resolution') {
          add[name] = new Resolution(name, prefixes, this);
        } else if (this.data[name].selector) {
          add.selectors.push(Selector.load(name, prefixes, this));
        } else {
          props = this.data[name].transition ? this.transitionProps : this.data[name].props;
          if (props) {
            value = Value.load(name, prefixes, this);
            for (j = 0, len = props.length; j < len; j++) {
              prop = props[j];
              if (!add[prop]) {
                add[prop] = {
                  values: []
                };
              }
              add[prop].values.push(value);
            }
          }
          if (!this.data[name].props) {
            values = ((ref1 = add[name]) != null ? ref1.values : void 0) || [];
            add[name] = Declaration.load(name, prefixes, this);
            add[name].values = values;
          }
        }
      }
      remove = {
        selectors: []
      };
      ref2 = selected.remove;
      for (name in ref2) {
        prefixes = ref2[name];
        if (this.data[name].selector) {
          selector = Selector.load(name, prefixes);
          for (k = 0, len1 = prefixes.length; k < len1; k++) {
            prefix = prefixes[k];
            remove.selectors.push(selector.old(prefix));
          }
        } else if (name === '@keyframes' || name === '@viewport') {
          for (l = 0, len2 = prefixes.length; l < len2; l++) {
            prefix = prefixes[l];
            prefixed = '@' + prefix + name.slice(1);
            remove[prefixed] = {
              remove: true
            };
          }
        } else if (name === '@resolution') {
          remove[name] = new Resolution(name, prefixes, this);
        } else {
          props = this.data[name].transition ? this.transitionProps : this.data[name].props;
          if (props) {
            value = Value.load(name, [], this);
            for (m = 0, len3 = prefixes.length; m < len3; m++) {
              prefix = prefixes[m];
              old = value.old(prefix);
              if (old) {
                for (n = 0, len4 = props.length; n < len4; n++) {
                  prop = props[n];
                  if (!remove[prop]) {
                    remove[prop] = {};
                  }
                  if (!remove[prop].values) {
                    remove[prop].values = [];
                  }
                  remove[prop].values.push(old);
                }
              }
            }
          }
          if (!this.data[name].props) {
            for (o = 0, len5 = prefixes.length; o < len5; o++) {
              prefix = prefixes[o];
              prop = vendor.unprefixed(name);
              olds = this.decl(name).old(name, prefix);
              for (p = 0, len6 = olds.length; p < len6; p++) {
                prefixed = olds[p];
                if (!remove[prefixed]) {
                  remove[prefixed] = {};
                }
                remove[prefixed].remove = true;
              }
            }
          }
        }
      }
      return [add, remove];
    };

    Prefixes.prototype.decl = function(prop) {
      var decl;
      decl = declsCache[prop];
      if (decl) {
        return decl;
      } else {
        return declsCache[prop] = Declaration.load(prop);
      }
    };

    Prefixes.prototype.unprefixed = function(prop) {
      prop = vendor.unprefixed(prop);
      return this.decl(prop).normalize(prop);
    };

    Prefixes.prototype.prefixed = function(prop, prefix) {
      prop = vendor.unprefixed(prop);
      return this.decl(prop).prefixed(prop, prefix);
    };

    Prefixes.prototype.values = function(type, prop) {
      var data, global, ref, ref1, values;
      data = this[type];
      global = (ref = data['*']) != null ? ref.values : void 0;
      values = (ref1 = data[prop]) != null ? ref1.values : void 0;
      if (global && values) {
        return utils.uniq(global.concat(values));
      } else {
        return global || values || [];
      }
    };

    Prefixes.prototype.group = function(decl) {
      var checker, index, length, rule, unprefixed;
      rule = decl.parent;
      index = rule.index(decl);
      length = rule.nodes.length;
      unprefixed = this.unprefixed(decl.prop);
      checker = (function(_this) {
        return function(step, callback) {
          var other;
          index += step;
          while (index >= 0 && index < length) {
            other = rule.nodes[index];
            if (other.type === 'decl') {
              if (step === -1 && other.prop === unprefixed) {
                if (!Browsers.withPrefix(other.value)) {
                  break;
                }
              }
              if (_this.unprefixed(other.prop) !== unprefixed) {
                break;
              } else if (callback(other) === true) {
                return true;
              }
              if (step === +1 && other.prop === unprefixed) {
                if (!Browsers.withPrefix(other.value)) {
                  break;
                }
              }
            }
            index += step;
          }
          return false;
        };
      })(this);
      return {
        up: function(callback) {
          return checker(-1, callback);
        },
        down: function(callback) {
          return checker(+1, callback);
        }
      };
    };

    return Prefixes;

  })();

  module.exports = Prefixes;

}).call(this);

},{"./at-rule":10,"./browsers":12,"./declaration":13,"./hacks/align-content":14,"./hacks/align-items":15,"./hacks/align-self":16,"./hacks/appearance":17,"./hacks/background-size":18,"./hacks/block-logical":19,"./hacks/border-image":20,"./hacks/border-radius":21,"./hacks/break-inside":22,"./hacks/display-flex":23,"./hacks/fill-available":24,"./hacks/filter":26,"./hacks/filter-value":25,"./hacks/flex":35,"./hacks/flex-basis":27,"./hacks/flex-direction":28,"./hacks/flex-flow":29,"./hacks/flex-grow":30,"./hacks/flex-shrink":31,"./hacks/flex-values":33,"./hacks/flex-wrap":34,"./hacks/fullscreen":36,"./hacks/gradient":37,"./hacks/image-rendering":38,"./hacks/inline-logical":39,"./hacks/justify-content":40,"./hacks/order":41,"./hacks/pixelated":42,"./hacks/placeholder":43,"./hacks/transform-decl":44,"./hacks/transform-value":45,"./processor":51,"./resolution":52,"./selector":53,"./supports":54,"./utils":55,"./value":56,"postcss/lib/vendor":159}],51:[function(require,module,exports){
(function() {
  var Processor, Value, utils, vendor;

  vendor = require('postcss/lib/vendor');

  Value = require('./value');

  utils = require('./utils');

  Processor = (function() {
    function Processor(prefixes) {
      this.prefixes = prefixes;
    }

    Processor.prototype.add = function(css, result) {
      var keyframes, resolution, supports, viewport;
      resolution = this.prefixes.add['@resolution'];
      keyframes = this.prefixes.add['@keyframes'];
      viewport = this.prefixes.add['@viewport'];
      supports = this.prefixes.add['@supports'];
      css.eachAtRule((function(_this) {
        return function(rule) {
          if (rule.name === 'keyframes') {
            if (!_this.disabled(rule)) {
              return keyframes != null ? keyframes.process(rule) : void 0;
            }
          } else if (rule.name === 'viewport') {
            if (!_this.disabled(rule)) {
              return viewport != null ? viewport.process(rule) : void 0;
            }
          } else if (rule.name === 'supports') {
            if (!_this.disabled(rule)) {
              return supports.process(rule);
            }
          } else if (rule.name === 'media' && rule.params.indexOf('-resolution') !== -1) {
            if (!_this.disabled(rule)) {
              return resolution != null ? resolution.process(rule) : void 0;
            }
          }
        };
      })(this));
      css.eachRule((function(_this) {
        return function(rule) {
          var j, len, ref, results, selector;
          if (_this.disabled(rule)) {
            return;
          }
          ref = _this.prefixes.add.selectors;
          results = [];
          for (j = 0, len = ref.length; j < len; j++) {
            selector = ref[j];
            results.push(selector.process(rule, result));
          }
          return results;
        };
      })(this));
      css.eachDecl((function(_this) {
        return function(decl) {
          var prefix;
          if (decl.prop === 'display' && decl.value === 'box') {
            result.warn('You should write display: flex by final spec ' + 'instead of display: box', {
              node: decl
            });
            return;
          }
          prefix = _this.prefixes.add[decl.prop];
          if (prefix && prefix.prefixes) {
            if (!_this.disabled(decl)) {
              return prefix.process(decl, result);
            }
          }
        };
      })(this));
      return css.eachDecl((function(_this) {
        return function(decl) {
          var j, len, ref, unprefixed, value;
          if (_this.disabled(decl)) {
            return;
          }
          unprefixed = _this.prefixes.unprefixed(decl.prop);
          ref = _this.prefixes.values('add', unprefixed);
          for (j = 0, len = ref.length; j < len; j++) {
            value = ref[j];
            value.process(decl, result);
          }
          return Value.save(_this.prefixes, decl);
        };
      })(this));
    };

    Processor.prototype.remove = function(css) {
      var checker, j, len, ref, resolution;
      resolution = this.prefixes.remove['@resolution'];
      css.eachAtRule((function(_this) {
        return function(rule, i) {
          if (_this.prefixes.remove['@' + rule.name]) {
            if (!_this.disabled(rule)) {
              return rule.parent.remove(i);
            }
          } else if (rule.name === 'media' && rule.params.indexOf('-resolution') !== -1) {
            return resolution != null ? resolution.clean(rule) : void 0;
          }
        };
      })(this));
      ref = this.prefixes.remove.selectors;
      for (j = 0, len = ref.length; j < len; j++) {
        checker = ref[j];
        css.eachRule((function(_this) {
          return function(rule, i) {
            if (checker.check(rule)) {
              if (!_this.disabled(rule)) {
                return rule.parent.remove(i);
              }
            }
          };
        })(this));
      }
      return css.eachDecl((function(_this) {
        return function(decl, i) {
          var k, len1, notHack, ref1, ref2, rule, unprefixed;
          if (_this.disabled(decl)) {
            return;
          }
          rule = decl.parent;
          unprefixed = _this.prefixes.unprefixed(decl.prop);
          if ((ref1 = _this.prefixes.remove[decl.prop]) != null ? ref1.remove : void 0) {
            notHack = _this.prefixes.group(decl).down(function(other) {
              return other.prop === unprefixed;
            });
            if (notHack && !_this.withHackValue(decl)) {
              if (decl.style('before').indexOf("\n") > -1) {
                _this.reduceSpaces(decl);
              }
              rule.remove(i);
              return;
            }
          }
          ref2 = _this.prefixes.values('remove', unprefixed);
          for (k = 0, len1 = ref2.length; k < len1; k++) {
            checker = ref2[k];
            if (checker.check(decl.value)) {
              unprefixed = checker.unprefixed;
              notHack = _this.prefixes.group(decl).down(function(other) {
                return other.value.indexOf(unprefixed) !== -1;
              });
              if (notHack) {
                rule.remove(i);
                return;
              } else if (checker.clean) {
                checker.clean(decl);
                return;
              }
            }
          }
        };
      })(this));
    };

    Processor.prototype.withHackValue = function(decl) {
      return decl.prop === '-webkit-background-clip' && decl.value === 'text';
    };

    Processor.prototype.disabled = function(node) {
      var status;
      if (node._autoprefixerDisabled != null) {
        return node._autoprefixerDisabled;
      } else if (node.nodes) {
        status = void 0;
        node.each(function(i) {
          if (i.type !== 'comment') {
            return;
          }
          if (i.text === 'autoprefixer: off') {
            status = false;
            return false;
          } else if (i.text === 'autoprefixer: on') {
            status = true;
            return false;
          }
        });
        return node._autoprefixerDisabled = status != null ? !status : node.parent ? this.disabled(node.parent) : false;
      } else if (node.parent) {
        return node._autoprefixerDisabled = this.disabled(node.parent);
      } else {
        return false;
      }
    };

    Processor.prototype.reduceSpaces = function(decl) {
      var diff, parts, prevMin, stop;
      stop = false;
      this.prefixes.group(decl).up(function(other) {
        return stop = true;
      });
      if (stop) {
        return;
      }
      parts = decl.style('before').split("\n");
      prevMin = parts[parts.length - 1].length;
      diff = false;
      return this.prefixes.group(decl).down(function(other) {
        var last;
        parts = other.style('before').split("\n");
        last = parts.length - 1;
        if (parts[last].length > prevMin) {
          if (diff === false) {
            diff = parts[last].length - prevMin;
          }
          parts[last] = parts[last].slice(0, -diff);
          return other.before = parts.join("\n");
        }
      });
    };

    return Processor;

  })();

  module.exports = Processor;

}).call(this);

},{"./utils":55,"./value":56,"postcss/lib/vendor":159}],52:[function(require,module,exports){
(function() {
  var Prefixer, Resolution, n2f, regexp, split, utils,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  Prefixer = require('./prefixer');

  utils = require('./utils');

  n2f = require('num2fraction');

  regexp = /(min|max)-resolution\s*:\s*\d*\.?\d+(dppx|dpi)/gi;

  split = /(min|max)-resolution(\s*:\s*)(\d*\.?\d+)(dppx|dpi)/i;

  Resolution = (function(superClass) {
    extend(Resolution, superClass);

    function Resolution() {
      return Resolution.__super__.constructor.apply(this, arguments);
    }

    Resolution.prototype.prefixName = function(prefix, name) {
      return name = prefix === '-moz-' ? name + '--moz-device-pixel-ratio' : prefix + name + '-device-pixel-ratio';
    };

    Resolution.prototype.prefixQuery = function(prefix, name, colon, value, units) {
      if (units === 'dpi') {
        value = Number(value / 96);
      }
      if (prefix === '-o-') {
        value = n2f(value);
      }
      return this.prefixName(prefix, name) + colon + value;
    };

    Resolution.prototype.clean = function(rule) {
      var j, len, prefix, ref;
      if (!this.bad) {
        this.bad = [];
        ref = this.prefixes;
        for (j = 0, len = ref.length; j < len; j++) {
          prefix = ref[j];
          this.bad.push(this.prefixName(prefix, 'min'));
          this.bad.push(this.prefixName(prefix, 'max'));
        }
      }
      return rule.params = utils.editList(rule.params, (function(_this) {
        return function(queries) {
          return queries.filter(function(query) {
            return _this.bad.every(function(i) {
              return query.indexOf(i) === -1;
            });
          });
        };
      })(this));
    };

    Resolution.prototype.process = function(rule) {
      var parent, prefixes;
      parent = this.parentPrefix(rule);
      prefixes = parent ? [parent] : this.prefixes;
      return rule.params = utils.editList(rule.params, (function(_this) {
        return function(origin, prefixed) {
          var j, k, len, len1, prefix, processed, query;
          for (j = 0, len = origin.length; j < len; j++) {
            query = origin[j];
            if (query.indexOf('min-resolution') === -1 && query.indexOf('max-resolution') === -1) {
              prefixed.push(query);
              continue;
            }
            for (k = 0, len1 = prefixes.length; k < len1; k++) {
              prefix = prefixes[k];
              if (prefix === '-moz-' && rule.params.indexOf('dpi') !== -1) {
                continue;
              } else {
                processed = query.replace(regexp, function(str) {
                  var parts;
                  parts = str.match(split);
                  return _this.prefixQuery(prefix, parts[1], parts[2], parts[3], parts[4]);
                });
                prefixed.push(processed);
              }
            }
            prefixed.push(query);
          }
          return utils.uniq(prefixed);
        };
      })(this));
    };

    return Resolution;

  })(Prefixer);

  module.exports = Resolution;

}).call(this);

},{"./prefixer":49,"./utils":55,"num2fraction":138}],53:[function(require,module,exports){
(function() {
  var Browsers, OldSelector, Prefixer, Selector, utils,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  OldSelector = require('./old-selector');

  Prefixer = require('./prefixer');

  Browsers = require('./browsers');

  utils = require('./utils');

  Selector = (function(superClass) {
    extend(Selector, superClass);

    function Selector(name1, prefixes, all) {
      this.name = name1;
      this.prefixes = prefixes;
      this.all = all;
      this.regexpCache = {};
    }

    Selector.prototype.check = function(rule) {
      if (rule.selector.indexOf(this.name) !== -1) {
        return !!rule.selector.match(this.regexp());
      } else {
        return false;
      }
    };

    Selector.prototype.prefixed = function(prefix) {
      return this.name.replace(/^([^\w]*)/, '$1' + prefix);
    };

    Selector.prototype.regexp = function(prefix) {
      var name;
      if (this.regexpCache[prefix]) {
        return this.regexpCache[prefix];
      }
      name = prefix ? this.prefixed(prefix) : this.name;
      return this.regexpCache[prefix] = RegExp("(^|[^:\"'=])" + (utils.escapeRegexp(name)), "gi");
    };

    Selector.prototype.possible = function() {
      return Browsers.prefixes();
    };

    Selector.prototype.prefixeds = function(rule) {
      var i, len, prefix, prefixeds, ref;
      if (rule._autoprefixerPrefixeds) {
        return rule._autoprefixerPrefixeds;
      }
      prefixeds = {};
      ref = this.possible();
      for (i = 0, len = ref.length; i < len; i++) {
        prefix = ref[i];
        prefixeds[prefix] = this.replace(rule.selector, prefix);
      }
      return rule._autoprefixerPrefixeds = prefixeds;
    };

    Selector.prototype.already = function(rule, prefixeds, prefix) {
      var before, index, key, prefixed, some;
      index = rule.parent.index(rule) - 1;
      while (index >= 0) {
        before = rule.parent.nodes[index];
        if (before.type !== 'rule') {
          return false;
        }
        some = false;
        for (key in prefixeds) {
          prefixed = prefixeds[key];
          if (before.selector === prefixed) {
            if (prefix === key) {
              return true;
            } else {
              some = true;
              break;
            }
          }
        }
        if (!some) {
          return false;
        }
        index -= 1;
      }
      return false;
    };

    Selector.prototype.replace = function(selector, prefix) {
      return selector.replace(this.regexp(), '$1' + this.prefixed(prefix));
    };

    Selector.prototype.add = function(rule, prefix) {
      var cloned, prefixeds;
      prefixeds = this.prefixeds(rule);
      if (this.already(rule, prefixeds, prefix)) {
        return;
      }
      cloned = this.clone(rule, {
        selector: prefixeds[prefix]
      });
      return rule.parent.insertBefore(rule, cloned);
    };

    Selector.prototype.old = function(prefix) {
      return new OldSelector(this, prefix);
    };

    return Selector;

  })(Prefixer);

  module.exports = Selector;

}).call(this);

},{"./browsers":12,"./old-selector":47,"./prefixer":49,"./utils":55}],54:[function(require,module,exports){
(function() {
  var Prefixes, Supports, Value, findCondition, findDecl, list, postcss, split, utils;

  Prefixes = require('./prefixes');

  Value = require('./value');

  utils = require('./utils');

  postcss = require('postcss');

  list = require('postcss/lib/list');

  split = /\(\s*([^\(\):]+)\s*:([^\)]+)/;

  findDecl = /\(\s*([^\(\):]+)\s*:\s*(.+)\s*\)/g;

  findCondition = /(not\s*)?\(\s*([^\(\):]+)\s*:\s*(.+?(?!\s*or\s*).+?)\s*\)*\s*\)\s*or\s*/gi;

  Supports = (function() {
    function Supports(all1) {
      this.all = all1;
    }

    Supports.prototype.virtual = function(prop, value) {
      var rule;
      rule = postcss.parse('a{}').first;
      rule.append({
        prop: prop,
        value: value,
        before: ''
      });
      return rule;
    };

    Supports.prototype.prefixed = function(prop, value) {
      var decl, j, k, len, len1, prefixer, ref, ref1, rule;
      rule = this.virtual(prop, value);
      prefixer = this.all.add[prop];
      if (prefixer != null) {
        if (typeof prefixer.process === "function") {
          prefixer.process(rule.first);
        }
      }
      ref = rule.nodes;
      for (j = 0, len = ref.length; j < len; j++) {
        decl = ref[j];
        ref1 = this.all.values('add', prop);
        for (k = 0, len1 = ref1.length; k < len1; k++) {
          value = ref1[k];
          value.process(decl);
        }
        Value.save(this.all, decl);
      }
      return rule.nodes;
    };

    Supports.prototype.clean = function(params) {
      return params.replace(findCondition, (function(_this) {
        return function(all) {
          var _, check, checker, j, len, prop, ref, ref1, ref2, unprefixed, value;
          if (all.slice(0, 3).toLowerCase() === 'not') {
            return all;
          }
          ref = all.match(split), _ = ref[0], prop = ref[1], value = ref[2];
          unprefixed = _this.all.unprefixed(prop);
          if ((ref1 = _this.all.cleaner().remove[prop]) != null ? ref1.remove : void 0) {
            check = new RegExp('(\\(|\\s)' + utils.escapeRegexp(unprefixed) + ':');
            if (check.test(params)) {
              return '';
            }
          }
          ref2 = _this.all.cleaner().values('remove', unprefixed);
          for (j = 0, len = ref2.length; j < len; j++) {
            checker = ref2[j];
            if (checker.check(value)) {
              return '';
            }
          }
          return all;
        };
      })(this)).replace(/\(\s*\((.*)\)\s*\)/g, '($1)');
    };

    Supports.prototype.process = function(rule) {
      rule.params = this.clean(rule.params);
      return rule.params = rule.params.replace(findDecl, (function(_this) {
        return function(all, prop, value) {
          var i, stringed;
          stringed = (function() {
            var j, len, ref, results;
            ref = this.prefixed(prop, value);
            results = [];
            for (j = 0, len = ref.length; j < len; j++) {
              i = ref[j];
              results.push("(" + i.prop + ": " + i.value + ")");
            }
            return results;
          }).call(_this);
          if (stringed.length === 1) {
            return stringed[0];
          } else {
            return '(' + stringed.join(' or ') + ')';
          }
        };
      })(this));
    };

    return Supports;

  })();

  module.exports = Supports;

}).call(this);

},{"./prefixes":50,"./utils":55,"./value":56,"postcss":152,"postcss/lib/list":147}],55:[function(require,module,exports){
(function() {
  var list;

  list = require('postcss/lib/list');

  module.exports = {
    error: function(text) {
      var err;
      err = new Error(text);
      err.autoprefixer = true;
      throw err;
    },
    uniq: function(array) {
      var filtered, i, j, len;
      filtered = [];
      for (j = 0, len = array.length; j < len; j++) {
        i = array[j];
        if (filtered.indexOf(i) === -1) {
          filtered.push(i);
        }
      }
      return filtered;
    },
    removeNote: function(string) {
      if (string.indexOf(' ') === -1) {
        return string;
      } else {
        return string.split(' ')[0];
      }
    },
    escapeRegexp: function(string) {
      return string.replace(/[.?*+\^\$\[\]\\(){}|\-]/g, '\\$&');
    },
    regexp: function(word, escape) {
      if (escape == null) {
        escape = true;
      }
      if (escape) {
        word = this.escapeRegexp(word);
      }
      return RegExp("(^|[\\s,(])(" + word + "($|[\\s(,]))", "gi");
    },
    editList: function(value, callback) {
      var changed, join, origin;
      origin = list.comma(value);
      changed = callback(origin, []);
      if (origin === changed) {
        return value;
      } else {
        join = value.match(/,\s*/);
        join = join ? join[0] : ', ';
        return changed.join(join);
      }
    }
  };

}).call(this);

},{"postcss/lib/list":147}],56:[function(require,module,exports){
(function() {
  var OldValue, Prefixer, Value, utils, vendor,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  Prefixer = require('./prefixer');

  OldValue = require('./old-value');

  utils = require('./utils');

  vendor = require('postcss/lib/vendor');

  Value = (function(superClass) {
    extend(Value, superClass);

    function Value() {
      return Value.__super__.constructor.apply(this, arguments);
    }

    Value.save = function(prefixes, decl) {
      var already, cloned, prefix, prefixed, propPrefix, ref, results, rule, trimmed, value;
      ref = decl._autoprefixerValues;
      results = [];
      for (prefix in ref) {
        value = ref[prefix];
        if (value === decl.value) {
          continue;
        }
        propPrefix = vendor.prefix(decl.prop);
        if (propPrefix === prefix) {
          results.push(decl.value = value);
        } else if (propPrefix === '-pie-') {
          continue;
        } else {
          prefixed = prefixes.prefixed(decl.prop, prefix);
          rule = decl.parent;
          if (rule.every(function(i) {
            return i.prop !== prefixed;
          })) {
            trimmed = value.replace(/\s+/, ' ');
            already = rule.some(function(i) {
              return i.prop === decl.prop && i.value.replace(/\s+/, ' ') === trimmed;
            });
            if (!already) {
              if (value.indexOf('-webkit-filter') !== -1 && (decl.prop === 'transition' || decl.prop === 'trasition-property')) {
                results.push(decl.value = value);
              } else {
                cloned = this.clone(decl, {
                  value: value
                });
                results.push(decl.parent.insertBefore(decl, cloned));
              }
            } else {
              results.push(void 0);
            }
          } else {
            results.push(void 0);
          }
        }
      }
      return results;
    };

    Value.prototype.check = function(decl) {
      var value;
      value = decl.value;
      if (value.indexOf(this.name) !== -1) {
        return !!value.match(this.regexp());
      } else {
        return false;
      }
    };

    Value.prototype.regexp = function() {
      return this.regexpCache || (this.regexpCache = utils.regexp(this.name));
    };

    Value.prototype.replace = function(string, prefix) {
      return string.replace(this.regexp(), '$1' + prefix + '$2');
    };

    Value.prototype.add = function(decl, prefix) {
      var ref, value;
      decl._autoprefixerValues || (decl._autoprefixerValues = {});
      value = decl._autoprefixerValues[prefix] || ((ref = decl._value) != null ? ref.raw : void 0) || decl.value;
      value = this.replace(value, prefix);
      if (value) {
        return decl._autoprefixerValues[prefix] = value;
      }
    };

    Value.prototype.old = function(prefix) {
      return new OldValue(this.name, prefix + this.name);
    };

    return Value;

  })(Prefixer);

  module.exports = Value;

}).call(this);

},{"./old-value":48,"./prefixer":49,"./utils":55,"postcss/lib/vendor":159}],57:[function(require,module,exports){
module.exports = function(a, b, str) {
  var bal = 0;
  var m = {};

  for (var i = 0; i < str.length; i++) {
    if (a == str.substr(i, a.length)) {
      if (!('start' in m)) m.start = i;
      bal++;
    }
    else if (b == str.substr(i, b.length) && 'start' in m) {
      bal--;
      if (!bal) {
        m.end = i;
        m.pre = str.substr(0, m.start);
        m.body = (m.end - m.start > 1)
          ? str.substring(m.start + a.length, m.end)
          : '';
        m.post = str.slice(m.end + b.length);
        return m;
      }
    }
  }
};


},{}],58:[function(require,module,exports){
(function (process){
var caniuse = require('caniuse-db/data').agents;
var path    = require('path');
var fs      = require('fs');

var uniq = function (array) {
    var filtered = [];
    for ( var i = 0; i < array.length; i++ ) {
        if ( filtered.indexOf(array[i]) === -1 ) filtered.push(array[i]);
    }
    return filtered;
};

// Return array of browsers by selection queries:
//
//   browserslist('IE >= 10, IE 8') //=> ['ie 11', 'ie 10', 'ie 8']
var browserslist = function (selections, opts) {
    if ( typeof opts === 'undefined' ) opts = { };

    if ( typeof selections === 'undefined' || selections === null ) {

        if ( process.env.BROWSERSLIST ) {
            selections = process.env.BROWSERSLIST;
        } else if ( opts.config || process.env.BROWSERSLIST_CONFIG ) {
            var file = opts.config || process.env.BROWSERSLIST_CONFIG;
            if ( fs.existsSync(file) && fs.statSync(file).isFile() ) {
                selections = browserslist.parseConfig( fs.readFileSync(file) );
            } else {
                throw 'Can\'t read ' + file + ' config';
            }
        } else {
            var config = browserslist.readConfig(opts.path);
            if ( config !== false ) {
                selections = config;
            } else {
                selections = browserslist.defaults;
            }
        }
    }

    if ( typeof selections === 'string' ) {
        selections = selections.split(/,\s*/);
    }

    var result = [];

    var query, match, array, used;
    selections.forEach(function (selection) {
        if ( selection.trim() === '' ) return;
        used = false;

        for ( var i in browserslist.queries ) {
            query = browserslist.queries[i];
            match = selection.match(query.regexp);
            if ( match ) {
                array  = query.select.apply(browserslist, match.slice(1));
                result = result.concat(array);
                used   = true;
                break;
            }
        }

        if ( !used ) {
            throw 'Unknown browser query `' + selection + '`';
        }
    });

    return uniq(result).sort(function (name1, name2) {
        name1 = name1.split(' ');
        name2 = name2.split(' ');
        if ( name1[0] === name2[0] ) {
            var d = parseFloat(name2[1]) - parseFloat(name1[1]);
            if ( d > 0 ) {
                return 1;
            } else if ( d < 0 ) {
                return -1;
            } else {
                return 0;
            }
        } else {
            return name1[0].localeCompare(name2[0]);
        }
    });
};

// Helpers

var normalizeVersion = function (data, version) {
    if ( data.versions.indexOf(version) !== -1 ) {
        return version;
    } else {
        var alias = browserslist.versionAliases[data.name][version];
        if ( alias ) return alias;
    }
};

var normalize = function (versions) {
    return versions.filter(function (version) {
        return typeof version === 'string';
    });
};

var fillUsage = function (result, name, data) {
    for ( var i in data ) {
        result[name + ' ' + i] = data[i];
    }
};

// Will be filled by Can I Use data below
browserslist.data  = { };
browserslist.usage = {
    global: { }
};

// Default browsers query
browserslist.defaults = [
    '> 1%',
    'last 2 versions',
    'Firefox ESR',
    'Opera 12.1'
];

// What browsers will be used in `last n version` query
browserslist.major = ['safari', 'opera', 'ios_saf', 'ie_mob', 'ie',
                      'firefox', 'chrome'];

// Browser names aliases
browserslist.aliases = {
    fx:             'firefox',
    ff:             'firefox',
    ios:            'ios_saf',
    explorer:       'ie',
    blackberry:     'bb',
    explorermobile: 'ie_mob',
    operamini:      'op_mini',
    operamobile:    'op_mob',
    chromeandroid:  'and_chr',
    firefoxandroid: 'and_ff'
};

// Aliases ot work with joined versions like `ios_saf 7.0-7.1`
browserslist.versionAliases = { };

// Get browser data by alias or case insensitive name
browserslist.byName = function (name) {
    name = name.toLowerCase();
    name = browserslist.aliases[name] || name;
    return browserslist.data[name];
};

// Get browser data by alias or case insensitive name and throw error
// on unknown browser
browserslist.checkName = function (name) {
    var data = browserslist.byName(name);
    if ( !data ) throw 'Unknown browser ' + name;
    return data;
};

// Find config, read file and parse it
browserslist.readConfig = function (from) {
    if ( from === false )   return false;
    if ( !fs.readFileSync ) return false;
    if ( typeof from === 'undefined' ) from = '.';

    var dirs = path.resolve(from).split(path.sep);
    var config;
    while ( dirs.length ) {
        config = dirs.concat(['browserslist']).join(path.sep);

        if ( fs.existsSync(config) && fs.statSync(config).isFile() ) {
            return browserslist.parseConfig( fs.readFileSync(config) );
        }

        dirs.pop();
    }

    return false;
};

// Return array of queries from config content
browserslist.parseConfig = function (string) {
    return string.toString()
                 .replace(/#[^\n]*/g, '')
                 .split(/\n/)
                 .map(function (i) {
                     return i.trim();
                 })
                 .filter(function (i) {
                     return i !== '';
                 });
};

browserslist.queries = {

    lastVersions: {
        regexp: /^last (\d+) versions?$/i,
        select: function (versions) {
            var selected = [];
            browserslist.major.forEach(function (name) {
                var data  = browserslist.byName(name);
                if ( !data ) return;
                var array = data.released.slice(-versions);

                array = array.map(function (v) {
                    return data.name + ' ' + v;
                });
                selected = selected.concat(array);
            });
            return selected;
        }
    },

    lastByBrowser: {
        regexp: /^last (\d+) (\w+) versions?$/i,
        select: function (versions, name) {
            var data = browserslist.checkName(name);
            return data.released.slice(-versions).map(function (v) {
                return data.name + ' ' + v;
            });
        }
    },

    globalStatistics: {
        regexp: /^> (\d+\.?\d*)%$/,
        select: function (popularity) {
            popularity = parseFloat(popularity);
            var result = [];

            for ( var version in browserslist.usage.global ) {
                if ( browserslist.usage.global[version] > popularity ) {
                    result.push(version);
                }
            }

            return result;
        }
    },

    countryStatistics: {
        regexp: /^> (\d+\.?\d*)% in (\w\w)$/,
        select: function (popularity, country) {
            popularity = parseFloat(popularity);
            country    = country.toUpperCase();
            var result = [];

            var usage = browserslist.usage[country];
            if ( !usage ) {
                usage = { };
                var data = require('caniuse-db/region-usage-json/' + country);
                for ( var i in data.data ) {
                    fillUsage(usage, i, data.data[i]);
                }
                browserslist.usage[country] = usage;
            }

            for ( var version in usage ) {
                if ( usage[version] > popularity ) {
                    result.push(version);
                }
            }

            return result;
        }
    },

    versions: {
        regexp: /^(\w+) (>=?|<=?)\s*([\d\.]+)/,
        select: function (name, sign, version) {
            var data = browserslist.checkName(name);
            var alias = normalizeVersion(data, version);
            if ( alias ) {
                version = alias;
            }
            version = parseFloat(version);

            var filter;
            if ( sign === '>' ) {
                filter = function (v) {
                    return parseFloat(v) > version;
                };
            } else if ( sign === '>=' ) {
                filter = function (v) {
                    return parseFloat(v) >= version;
                };
            } else if ( sign === '<' ) {
                filter = function (v) {
                    return parseFloat(v) < version;
                };
            } else if ( sign === '<=' ) {
                filter = function (v) {
                    return parseFloat(v) <= version;
                };
            }
            return data.released.filter(filter).map(function (v) {
                return data.name + ' ' + v;
            });
        }
    },

    esr: {
        regexp: /^(firefox|ff|fx) esr$/i,
        select: function () {
            return ['firefox 31'];
        }
    },

    direct: {
        regexp: /^(\w+) ([\d\.]+)$/,
        select: function (name, version) {
            var data  = browserslist.checkName(name);
            var alias = normalizeVersion(data, version);
            if ( alias ) {
                version = alias;
            } else {
                if ( version.indexOf('.') === -1 ) {
                    alias = version + '.0';
                } else if ( /\.0$/.test(version) ) {
                    alias = version.replace(/\.0$/, '');
                }
                alias = normalizeVersion(data, alias);
                if ( alias ) {
                    version = alias;
                } else {
                    throw 'Unknown version ' + version + ' of ' + name;
                }
            }
            return [data.name + ' ' + version];
        }
    }

};

// Get and convert Can I Use data

(function () {
    for ( var name in caniuse ) {
        browserslist.data[name] = {
            name:     name,
            versions: normalize(caniuse[name].versions),
            released: normalize(caniuse[name].versions.slice(0, -3))
        };
        fillUsage(browserslist.usage.global, name, caniuse[name].usage_global);

        browserslist.versionAliases[name] = { };
        for ( var i = 0; i < caniuse[name].versions.length; i++ ) {
            if ( !caniuse[name].versions[i] ) continue;
            var full = caniuse[name].versions[i];

            if ( full.indexOf('-') !== -1 ) {
                var interval = full.split('-');
                for ( var j = 0; j < interval.length; j++ ) {
                    browserslist.versionAliases[name][ interval[j] ] = full;
                }
            }
        }
    }
})();

module.exports = browserslist;

}).call(this,require('_process'))
},{"_process":7,"caniuse-db/data":59,"fs":1,"path":6}],59:[function(require,module,exports){
},{}],60:[function(require,module,exports){
module.exports={
  "title":"CSS3 Background-image options",
  "description":"New properties to affect background images, including background-clip, background-origin and background-size",
  "spec":"http://www.w3.org/TR/css3-background/#backgrounds",
  "status":"cr",
  "links":[
    {
      "url":"http://www.standardista.com/css3/css3-background-properties",
      "title":"Detailed compatibility tables and demos"
    },
    {
      "url":"http://www.css3files.com/background/",
      "title":"Information page"
    },
    {
      "url":"https://github.com/louisremi/background-size-polyfill",
      "title":"Polyfill for IE7-8"
    }
  ],
  "bugs":[
    {
      "description":"iOS Safari has buggy behavior with `background-size: cover;` on a page's body."
    },
    {
      "description":"iOS Safari has buggy behavior with `background-size: cover;` + `background-attachment: fixed;`"
    },
    {
      "description":"Safari (OS X and iOS) and Chrome do not support background-size: 100% <height>px; in combination with SVG images, it leaves them at the original size while other browsers stretch the vector image correctly while leaving the height at the specified number of pixels."
    },
    {
      "description":"Android 4.3 browser and below are reported to not support percentages in `background-size`"
    }
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"y",
      "10":"y",
      "11":"y"
    },
    "edge":{
      "12":"y",
      "13":"y",
      "14":"y"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"a x",
      "4":"y",
      "5":"y",
      "6":"y",
      "7":"y",
      "8":"y",
      "9":"y",
      "10":"y",
      "11":"y",
      "12":"y",
      "13":"y",
      "14":"y",
      "15":"y",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y"
    },
    "chrome":{
      "4":"a #3",
      "5":"a #3",
      "6":"a #3",
      "7":"a #3",
      "8":"a #3",
      "9":"a #3",
      "10":"a #3",
      "11":"a #3",
      "12":"a #3",
      "13":"a #3",
      "14":"a #3",
      "15":"y",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y",
      "51":"y",
      "52":"y",
      "53":"y",
      "54":"y"
    },
    "safari":{
      "3.1":"a #2 #3",
      "3.2":"a #2 #3",
      "4":"a #2 #3",
      "5":"a #2 #3",
      "5.1":"a #2 #3",
      "6":"a #2 #3",
      "6.1":"a #2 #3",
      "7":"y",
      "7.1":"y",
      "8":"y",
      "9":"y",
      "9.1":"y",
      "10":"y",
      "TP":"y"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"a x",
      "10.5":"y",
      "10.6":"y",
      "11":"y",
      "11.1":"y",
      "11.5":"y",
      "11.6":"y",
      "12":"y",
      "12.1":"y",
      "15":"y",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y"
    },
    "ios_saf":{
      "3.2":"a",
      "4.0-4.1":"a",
      "4.2-4.3":"a",
      "5.0-5.1":"a #3",
      "6.0-6.1":"a",
      "7.0-7.1":"y",
      "8":"y",
      "8.1-8.4":"y",
      "9.0-9.2":"y",
      "9.3":"y"
    },
    "op_mini":{
      "all":"a #1"
    },
    "android":{
      "2.1":"a x",
      "2.2":"a x #3",
      "2.3":"a x #3",
      "3":"a #3",
      "4":"a #3",
      "4.1":"a #3",
      "4.2-4.3":"a #3",
      "4.4":"y",
      "4.4.3-4.4.4":"y",
      "50":"y"
    },
    "bb":{
      "7":"y",
      "10":"y"
    },
    "op_mob":{
      "10":"y",
      "11":"y",
      "11.1":"y",
      "11.5":"y",
      "12":"y",
      "12.1":"y",
      "37":"y"
    },
    "and_chr":{
      "51":"y"
    },
    "and_ff":{
      "46":"y"
    },
    "ie_mob":{
      "10":"y",
      "11":"y"
    },
    "and_uc":{
      "9.9":"y"
    },
    "samsung":{
      "4":"y"
    }
  },
  "notes":"Safari also supports the unofficial `-webkit-background-clip: text` (only with prefix)",
  "notes_by_num":{
    "1":"Partial support in Opera Mini refers to not supporting background sizing or background attachments. However Opera Mini 7.5 supports background sizing (including cover and contain values).",
    "2":"Partial support in Safari 6 refers to not supporting background sizing offset from edges syntax.",
    "3":"Does not support `background-size` values in the `background` shorthand"
  },
  "usage_perc_y":91.12,
  "usage_perc_a":6.13,
  "ucprefix":false,
  "parent":"",
  "keywords":"",
  "ie_id":"",
  "chrome_id":"",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],61:[function(require,module,exports){
module.exports={
  "title":"CSS3 Border images",
  "description":"Method of using images for borders",
  "spec":"http://www.w3.org/TR/css3-background/#the-border-image",
  "status":"cr",
  "links":[
    {
      "url":"http://www.css3files.com/border/",
      "title":"Information page"
    },
    {
      "url":"http://docs.webplatform.org/wiki/css/properties/border-image",
      "title":"WebPlatform Docs"
    }
  ],
  "bugs":[
    {
      "description":"Firefox is not able to stretch svg images across an element - [bug report](https://bugzilla.mozilla.org/show_bug.cgi?id=619500)."
    },
    {
      "description":"WebKit browsers have a different rendering with the `round` value from other browsers, stretching the border rather than repeating it in certain cases [see bug](https://bugs.webkit.org/show_bug.cgi?id=155955)."
    }
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"y"
    },
    "edge":{
      "12":"y #1",
      "13":"y #1",
      "14":"y"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"a x #2 #3",
      "3.6":"a x #2 #3",
      "4":"a x #2 #3",
      "5":"a x #2 #3",
      "6":"a x #2 #3",
      "7":"a x #2 #3",
      "8":"a x #2 #3",
      "9":"a x #2 #3",
      "10":"a x #2 #3",
      "11":"a x #2 #3",
      "12":"a x #2 #3",
      "13":"a x #2 #3",
      "14":"a x #2 #3",
      "15":"a #2",
      "16":"a #2",
      "17":"a #2",
      "18":"a #2",
      "19":"a #2",
      "20":"a #2",
      "21":"a #2",
      "22":"a #2",
      "23":"a #2",
      "24":"a #2",
      "25":"a #2",
      "26":"a #2",
      "27":"a #2",
      "28":"a #2",
      "29":"a #2",
      "30":"a #2",
      "31":"a #2",
      "32":"a #2",
      "33":"a #2",
      "34":"a #2",
      "35":"a #2",
      "36":"a #2",
      "37":"a #2",
      "38":"a #2",
      "39":"a #2",
      "40":"a #2",
      "41":"a #2",
      "42":"a #2",
      "43":"a #2",
      "44":"a #2",
      "45":"a #2",
      "46":"a #2",
      "47":"a #2",
      "48":"a #2",
      "49":"a #2",
      "50":"a #2"
    },
    "chrome":{
      "4":"a x #1 #2 #3 #4",
      "5":"a x #1 #2 #3 #4",
      "6":"a x #1 #2 #3 #4",
      "7":"a x #1 #2 #3 #4",
      "8":"a x #1 #2 #3 #4",
      "9":"a x #1 #2 #3 #4",
      "10":"a x #1 #2 #3 #4",
      "11":"a x #1 #2 #3 #4",
      "12":"a x #1 #2 #3 #4",
      "13":"a x #1 #2 #3 #4",
      "14":"a x #1 #2 #3 #4",
      "15":"a #1 #2 #4",
      "16":"a #1 #2 #4",
      "17":"a #1 #2 #4",
      "18":"a #1 #2 #4",
      "19":"a #1 #2 #4",
      "20":"a #1 #2 #4",
      "21":"a #1 #2 #4",
      "22":"a #1 #2 #4",
      "23":"a #1 #2 #4",
      "24":"a #1 #2 #4",
      "25":"a #1 #2 #4",
      "26":"a #1 #2 #4",
      "27":"a #1 #2 #4",
      "28":"a #1 #2 #4",
      "29":"a #1 #2 #4",
      "30":"a #1 #2",
      "31":"a #1 #2",
      "32":"a #1 #2",
      "33":"a #1 #2",
      "34":"a #1 #2",
      "35":"a #1 #2",
      "36":"a #1 #2",
      "37":"a #1 #2",
      "38":"a #1 #2",
      "39":"a #1 #2",
      "40":"a #1 #2",
      "41":"a #1 #2",
      "42":"a #1 #2",
      "43":"a #1 #2",
      "44":"a #1 #2",
      "45":"a #1 #2",
      "46":"a #1 #2",
      "47":"a #1 #2",
      "48":"a #1 #2",
      "49":"a #1 #2",
      "50":"a #1 #2",
      "51":"a #2",
      "52":"a #2",
      "53":"a #2",
      "54":"a #2"
    },
    "safari":{
      "3.1":"a x #1 #2 #3 #4",
      "3.2":"a x #1 #2 #3 #4",
      "4":"a x #1 #2 #3 #4",
      "5":"a x #1 #2 #3 #4",
      "5.1":"a x #1 #2 #3 #4",
      "6":"a #1 #2 #4",
      "6.1":"a #1 #2 #4",
      "7":"a #1 #2 #4",
      "7.1":"a #1 #2 #4",
      "8":"a #1 #2 #4",
      "9":"a #1 #2 #4",
      "9.1":"y #1",
      "10":"y #1",
      "TP":"y #1"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"a #2 #3 #4",
      "10.6":"a #2 #3 #4",
      "11":"a x #2 #3 #4",
      "11.1":"a x #2 #3 #4",
      "11.5":"a x #2 #3 #4",
      "11.6":"a x #2 #3 #4",
      "12":"a x #2 #3 #4",
      "12.1":"a x #2 #3 #4",
      "15":"a #1 #2",
      "16":"a #1 #2",
      "17":"a #1 #2",
      "18":"a #1 #2",
      "19":"a #1 #2",
      "20":"a #1 #2",
      "21":"a #1 #2",
      "22":"a #1 #2",
      "23":"a #1 #2",
      "24":"a #1 #2",
      "25":"a #1 #2",
      "26":"a #1 #2",
      "27":"a #1 #2",
      "28":"a #1 #2",
      "29":"a #1 #2",
      "30":"a #1 #2",
      "31":"a #1 #2",
      "32":"a #1 #2",
      "33":"a #1 #2",
      "34":"a #1 #2",
      "35":"a #1 #2",
      "36":"a #1 #2",
      "37":"a #1 #2",
      "38":"a #2",
      "39":"a #2",
      "40":"a #2"
    },
    "ios_saf":{
      "3.2":"a x #1 #2 #3 #4",
      "4.0-4.1":"a x #1 #2 #3 #4",
      "4.2-4.3":"a x #1 #2 #3 #4",
      "5.0-5.1":"a x #1 #2 #3 #4",
      "6.0-6.1":"a #1 #2 #4",
      "7.0-7.1":"a #1 #2 #4",
      "8":"a #1 #2 #4",
      "8.1-8.4":"a #1 #2 #4",
      "9.0-9.2":"a #1 #2 #4",
      "9.3":"y #1"
    },
    "op_mini":{
      "all":"a x #2 #3 #4"
    },
    "android":{
      "2.1":"a #1 #2 #3 #4",
      "2.2":"a #1 #2 #3 #4",
      "2.3":"a #1 #2 #3 #4",
      "3":"a #1 #2 #3 #4",
      "4":"a #1 #2 #3 #4",
      "4.1":"a #1 #2 #3 #4",
      "4.2-4.3":"a #1 #2 #3 #4",
      "4.4":"a #1 #2",
      "4.4.3-4.4.4":"a #1 #2",
      "50":"a #1 #2"
    },
    "bb":{
      "7":"a #1 #2 #3 #4",
      "10":"a #1 #2 #4"
    },
    "op_mob":{
      "10":"n",
      "11":"a x #2 #3 #4",
      "11.1":"a x #2 #3 #4",
      "11.5":"a x #2 #3 #4",
      "12":"a x #2 #3 #4",
      "12.1":"a x #2 #3 #4",
      "37":"a #1 #2"
    },
    "and_chr":{
      "51":"a #2"
    },
    "and_ff":{
      "46":"a #2"
    },
    "ie_mob":{
      "10":"n",
      "11":"y"
    },
    "and_uc":{
      "9.9":"a #1 #2"
    },
    "samsung":{
      "4":"a #1 #2"
    }
  },
  "notes":"Note that both the `border-style` and `border-width` must be specified (not set to `none` or 0) for border-images to work.",
  "notes_by_num":{
    "1":"Has a bug where `border-image` incorrectly overrides `border-style`. See [test case](http://codepen.io/Savago/pen/yYrgyK), [WebKit bug](https://bugs.webkit.org/show_bug.cgi?id=99922), [discussion](https://github.com/whatwg/compat/issues/17)",
    "2":"Partial support refers to not supporting `border-image-repeat: space`",
    "3":"Partial support refers to supporting the shorthand syntax, but not the individual properties (`border-image-source`, `border-image-slice`, etc). ",
    "4":"Partial support refers to not supporting `border-image-repeat: round`"
  },
  "usage_perc_y":15.6,
  "usage_perc_a":80.61,
  "ucprefix":false,
  "parent":"",
  "keywords":"border-image-source,border-image-slice,border-image-repeat,border-image-width,,border-image-outset",
  "ie_id":"",
  "chrome_id":"",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],62:[function(require,module,exports){
module.exports={
  "title":"CSS3 Border-radius (rounded corners)",
  "description":"Method of making the border corners round. Covers support for the shorthand `border-radius` as well as the long-hand properties (e.g. `border-top-left-radius`)",
  "spec":"http://www.w3.org/TR/css3-background/#the-border-radius",
  "status":"cr",
  "links":[
    {
      "url":"http://border-radius.com",
      "title":"Border-radius CSS Generator"
    },
    {
      "url":"http://muddledramblings.com/table-of-css3-border-radius-compliance",
      "title":"Detailed compliance table"
    },
    {
      "url":"http://www.css3files.com/border/#borderradius",
      "title":"Information page"
    },
    {
      "url":"http://css3pie.com/",
      "title":"Polyfill which includes border-radius"
    },
    {
      "url":"http://docs.webplatform.org/wiki/css/properties/border-radius",
      "title":"WebPlatform Docs"
    }
  ],
  "bugs":[
    {
      "description":"Safari does not apply `border-radius` correctly to image borders: http://stackoverflow.com/q/17202128"
    },
    {
      "description":"Android Browser 2.3 does not support % value for `border-radius`."
    },
    {
      "description":"Border-radius does not work on fieldset elements in IE9."
    },
    {
      "description":"The stock browser on the Samsung Galaxy S4 with Android 4.2 does not support the `border-radius` shorthand property but does support the long-hand properties for each corner like `border-top-left-radius`."
    },
    {
      "description":"Older versions of Safari [had a bug](https://bugs.webkit.org/show_bug.cgi?id=50072) where background images would bleed out of the border-radius."
    },
    {
      "description":"Dotted and dashed rounded border corners are rendered as solid in Firefox. [see bug](https://bugzilla.mozilla.org/show_bug.cgi?id=382721)"
    }
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"y",
      "10":"y",
      "11":"y"
    },
    "edge":{
      "12":"y",
      "13":"y",
      "14":"y"
    },
    "firefox":{
      "2":"a x",
      "3":"y x",
      "3.5":"y x",
      "3.6":"y x",
      "4":"y",
      "5":"y",
      "6":"y",
      "7":"y",
      "8":"y",
      "9":"y",
      "10":"y",
      "11":"y",
      "12":"y",
      "13":"y",
      "14":"y",
      "15":"y",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y"
    },
    "chrome":{
      "4":"y x",
      "5":"y",
      "6":"y",
      "7":"y",
      "8":"y",
      "9":"y",
      "10":"y",
      "11":"y",
      "12":"y",
      "13":"y",
      "14":"y",
      "15":"y",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y",
      "51":"y",
      "52":"y",
      "53":"y",
      "54":"y"
    },
    "safari":{
      "3.1":"y x",
      "3.2":"y x",
      "4":"y x",
      "5":"y",
      "5.1":"y #1",
      "6":"y #1",
      "6.1":"y #1",
      "7":"y",
      "7.1":"y",
      "8":"y",
      "9":"y",
      "9.1":"y",
      "10":"y",
      "TP":"y"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"y",
      "10.6":"y",
      "11":"y",
      "11.1":"y",
      "11.5":"y",
      "11.6":"y",
      "12":"y",
      "12.1":"y",
      "15":"y",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y"
    },
    "ios_saf":{
      "3.2":"y x",
      "4.0-4.1":"y",
      "4.2-4.3":"y",
      "5.0-5.1":"y",
      "6.0-6.1":"y",
      "7.0-7.1":"y",
      "8":"y",
      "8.1-8.4":"y",
      "9.0-9.2":"y",
      "9.3":"y"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"y x",
      "2.2":"y",
      "2.3":"y",
      "3":"y",
      "4":"y",
      "4.1":"y",
      "4.2-4.3":"y",
      "4.4":"y",
      "4.4.3-4.4.4":"y",
      "50":"y"
    },
    "bb":{
      "7":"y",
      "10":"y"
    },
    "op_mob":{
      "10":"n",
      "11":"y",
      "11.1":"y",
      "11.5":"y",
      "12":"y",
      "12.1":"y",
      "37":"y"
    },
    "and_chr":{
      "51":"y"
    },
    "and_ff":{
      "46":"y"
    },
    "ie_mob":{
      "10":"y",
      "11":"y"
    },
    "and_uc":{
      "9.9":"y"
    },
    "samsung":{
      "4":"y"
    }
  },
  "notes":"",
  "notes_by_num":{
    "1":"Safari 6.1 and earlier did not apply `border-radius` correctly to image borders: http://stackoverflow.com/q/17202128"
  },
  "usage_perc_y":92.59,
  "usage_perc_a":0.02,
  "ucprefix":false,
  "parent":"",
  "keywords":"roundedcorners, border radius,-moz-border-radius",
  "ie_id":"",
  "chrome_id":"",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],63:[function(require,module,exports){
module.exports={
  "title":"calc() as CSS unit value",
  "description":"Method of allowing calculated values for length units, i.e. `width: calc(100% - 3em)`",
  "spec":"http://www.w3.org/TR/css3-values/#calc",
  "status":"cr",
  "links":[
    {
      "url":"http://hacks.mozilla.org/2010/06/css3-calc/",
      "title":"Mozilla Hacks article"
    },
    {
      "url":"https://developer.mozilla.org/en/docs/Web/CSS/calc",
      "title":"MDN article"
    },
    {
      "url":"http://docs.webplatform.org/wiki/css/functions/calc",
      "title":"WebPlatform Docs"
    }
  ],
  "bugs":[
    {
      "description":"IE10 crashes when a div with a property using `calc()` has a child with [same property with inherit](http://stackoverflow.com/questions/19423384/css-less-calc-method-is-crashing-my-ie10)."
    },
    {
      "description":"IE 9 - 11 don't render `box-shadow` when `calc()` is used for any of the values"
    },
    {
      "description":"IE10 and IE11 don't support using `calc()` inside a `transform`. [Bug report](https://connect.microsoft.com/IE/feedback/details/814380/)"
    },
    {
      "description":"Safari & iOS Safari (both 6 and 7) does not support viewport units (`vw`, `vh`, etc) in `calc()`."
    },
    {
      "description":"IE & Edge are reported to not support calc inside a 'flex'. (Not tested on older versions)\r\nThis example does not work: `flex: 1 1 calc(50% - 20px);`"
    },
    {
      "description":"Firefox does not support `calc()` inside the `line-height`, `stroke-width`, `stroke-dashoffset`, and `stroke-dasharray` properties. [Bug report](https://bugzilla.mozilla.org/show_bug.cgi?id=594933)"
    },
    {
      "description":"IE11 is reported to have trouble with `calc()` with nested expressions, e.g. `width: calc((100% - 10px) / 3);` (i.e. it rounds differently)"
    },
    {
      "description":"IE11 is reported to not support `calc()` correctly in [generated content](http://stackoverflow.com/questions/31323915/internet-explorer-incorrectly-calculates-percentage-height-for-generated-content)"
    },
    {
      "description":"IE11 does not support transitioning values set with `calc()`"
    }
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"a #2",
      "10":"y",
      "11":"y"
    },
    "edge":{
      "12":"y",
      "13":"y",
      "14":"y"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"n",
      "4":"y x",
      "5":"y x",
      "6":"y x",
      "7":"y x",
      "8":"y x",
      "9":"y x",
      "10":"y x",
      "11":"y x",
      "12":"y x",
      "13":"y x",
      "14":"y x",
      "15":"y x",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y"
    },
    "chrome":{
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y",
      "51":"y",
      "52":"y",
      "53":"y",
      "54":"y"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"n",
      "5":"n",
      "5.1":"n",
      "6":"y x",
      "6.1":"y",
      "7":"y",
      "7.1":"y",
      "8":"y",
      "9":"y",
      "9.1":"y",
      "10":"y",
      "TP":"y"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"n",
      "12":"n",
      "12.1":"n",
      "15":"y",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y"
    },
    "ios_saf":{
      "3.2":"n",
      "4.0-4.1":"n",
      "4.2-4.3":"n",
      "5.0-5.1":"n",
      "6.0-6.1":"y x",
      "7.0-7.1":"y",
      "8":"y",
      "8.1-8.4":"y",
      "9.0-9.2":"y",
      "9.3":"y"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"n",
      "2.2":"n",
      "2.3":"n",
      "3":"n",
      "4":"n",
      "4.1":"n",
      "4.2-4.3":"n",
      "4.4":"a #1",
      "4.4.3-4.4.4":"a #1",
      "50":"y"
    },
    "bb":{
      "7":"n",
      "10":"y"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "12":"n",
      "12.1":"n",
      "37":"y"
    },
    "and_chr":{
      "51":"y"
    },
    "and_ff":{
      "46":"y"
    },
    "ie_mob":{
      "10":"y",
      "11":"y"
    },
    "and_uc":{
      "9.9":"n"
    },
    "samsung":{
      "4":"y"
    }
  },
  "notes":"Support can be somewhat emulated in older versions of IE using the non-standard `expression()` syntax.\r\n\r\nDue to the way browsers handle [sub-pixel rounding](http://ejohn.org/blog/sub-pixel-problems-in-css/) differently, layouts using `calc()` expressions may have unexpected results.",
  "notes_by_num":{
    "1":"Partial support in Android Browser 4.4 refers to the browser lacking the ability to multiply and divide values.",
    "2":"Partial support in IE9 refers to the browser crashing when used as a `background-position` value."
  },
  "usage_perc_y":81.2,
  "usage_perc_a":3.06,
  "ucprefix":false,
  "parent":"",
  "keywords":"",
  "ie_id":"csscalc",
  "chrome_id":"5765241438732288",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],64:[function(require,module,exports){
module.exports={
  "title":"CSS Animation",
  "description":"Complex method of animating certain properties of an element",
  "spec":"http://www.w3.org/TR/css3-animations/",
  "status":"wd",
  "links":[
    {
      "url":"http://robertnyman.com/2010/05/06/css3-animations/",
      "title":"Blog post on usage"
    },
    {
      "url":"http://www.css3files.com/animation/",
      "title":"Information page"
    },
    {
      "url":"http://docs.webplatform.org/wiki/css/properties/animations",
      "title":"WebPlatform Docs"
    }
  ],
  "bugs":[
    {
      "description":"'animation-fill-mode' property is not supported in Android browser below 2.3."
    },
    {
      "description":"iOS 6.1 and below do not support animation on pseudo-elements. iOS 7 and higher are reported to have buggy behavior with animating pseudo-elements."
    },
    {
      "description":"@keyframes not supported in an inline or scoped stylesheet in Firefox (bug 830056)"
    },
    {
      "description":"In Chrome `animation-fill-mode backwards` is wrong if `steps(x, start)` is used [see example](http://codepen.io/Fyrd/pen/jPPKpX)."
    },
    {
      "description":"IE10 and IE11 do not support CSS animations inside media queries."
    },
    {
      "description":"IE10 and IE11 on Windows 7 have a bug where translate transform values are always interpreted as pixels when used in animations [test case](http://codepen.io/flxsource/pen/jPYWoE)"
    }
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"y",
      "11":"y"
    },
    "edge":{
      "12":"y",
      "13":"y",
      "14":"y"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"n",
      "4":"n",
      "5":"y x",
      "6":"y x",
      "7":"y x",
      "8":"y x",
      "9":"y x",
      "10":"y x",
      "11":"y x",
      "12":"y x",
      "13":"y x",
      "14":"y x",
      "15":"y x",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y"
    },
    "chrome":{
      "4":"y x",
      "5":"y x",
      "6":"y x",
      "7":"y x",
      "8":"y x",
      "9":"y x",
      "10":"y x",
      "11":"y x",
      "12":"y x",
      "13":"y x",
      "14":"y x",
      "15":"y x",
      "16":"y x",
      "17":"y x",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y x",
      "27":"y x",
      "28":"y x",
      "29":"y x",
      "30":"y x",
      "31":"y x",
      "32":"y x",
      "33":"y x",
      "34":"y x",
      "35":"y x",
      "36":"y x",
      "37":"y x",
      "38":"y x",
      "39":"y x",
      "40":"y x",
      "41":"y x",
      "42":"y x",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y",
      "51":"y",
      "52":"y",
      "53":"y",
      "54":"y"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"y x",
      "5":"y x",
      "5.1":"y x",
      "6":"y x",
      "6.1":"y x",
      "7":"y x",
      "7.1":"y x",
      "8":"y x",
      "9":"y",
      "9.1":"y",
      "10":"y",
      "TP":"y"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"n",
      "12":"y x",
      "12.1":"y",
      "15":"y x",
      "16":"y x",
      "17":"y x",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y x",
      "27":"y x",
      "28":"y x",
      "29":"y x",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y"
    },
    "ios_saf":{
      "3.2":"y x",
      "4.0-4.1":"y x",
      "4.2-4.3":"y x",
      "5.0-5.1":"y x",
      "6.0-6.1":"y x",
      "7.0-7.1":"y x",
      "8":"y x",
      "8.1-8.4":"y x",
      "9.0-9.2":"y",
      "9.3":"y"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"a x #1",
      "2.2":"a x #1",
      "2.3":"a x #1",
      "3":"a x #1",
      "4":"y x",
      "4.1":"y x",
      "4.2-4.3":"y x",
      "4.4":"y x",
      "4.4.3-4.4.4":"y x",
      "50":"y"
    },
    "bb":{
      "7":"y x",
      "10":"y x"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "12":"n",
      "12.1":"y",
      "37":"y"
    },
    "and_chr":{
      "51":"y"
    },
    "and_ff":{
      "46":"y"
    },
    "ie_mob":{
      "10":"y",
      "11":"y"
    },
    "and_uc":{
      "9.9":"y x"
    },
    "samsung":{
      "4":"y"
    }
  },
  "notes":"",
  "notes_by_num":{
    "1":"Partial support in Android browser refers to buggy behavior in different scenarios."
  },
  "usage_perc_y":92,
  "usage_perc_a":0.01,
  "ucprefix":false,
  "parent":"",
  "keywords":"animations,css-animations,animation-name,animation-duration,animation-delay,animation-timing-function,@keyframes,animationstart,animationend,animationiteration,css3 animation",
  "ie_id":"",
  "chrome_id":"",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],65:[function(require,module,exports){
module.exports={
  "title":"CSS Appearance",
  "description":"The `appearance` property defines how elements (particularly form controls) appear by default. By setting the value to `none` the default appearance can be entirely redefined using other CSS properties.",
  "spec":"https://drafts.csswg.org/css-ui-4/#appearance-switching",
  "status":"wd",
  "links":[
    {
      "url":"http://css-tricks.com/almanac/properties/a/appearance/",
      "title":"CSS Tricks article"
    }
  ],
  "bugs":[
    
  ],
  "categories":[
    "CSS"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n"
    },
    "edge":{
      "12":"a #1 #2",
      "13":"a #1 #2",
      "14":"a #1 #2"
    },
    "firefox":{
      "2":"a x #1",
      "3":"a x #1",
      "3.5":"a x #1",
      "3.6":"a x #1",
      "4":"a x #1",
      "5":"a x #1",
      "6":"a x #1",
      "7":"a x #1",
      "8":"a x #1",
      "9":"a x #1",
      "10":"a x #1",
      "11":"a x #1",
      "12":"a x #1",
      "13":"a x #1",
      "14":"a x #1",
      "15":"a x #1",
      "16":"a x #1",
      "17":"a x #1",
      "18":"a x #1",
      "19":"a x #1",
      "20":"a x #1",
      "21":"a x #1",
      "22":"a x #1",
      "23":"a x #1",
      "24":"a x #1",
      "25":"a x #1",
      "26":"a x #1",
      "27":"a x #1",
      "28":"a x #1",
      "29":"a x #1",
      "30":"a x #1",
      "31":"a x #1",
      "32":"a x #1",
      "33":"a x #1",
      "34":"a x #1",
      "35":"a x #1",
      "36":"a x #1",
      "37":"a x #1",
      "38":"a x #1",
      "39":"a x #1",
      "40":"a x #1",
      "41":"a x #1",
      "42":"a x #1",
      "43":"a x #1",
      "44":"a x #1",
      "45":"a x #1",
      "46":"a x #1",
      "47":"a x #1",
      "48":"a x #1",
      "49":"a x #1",
      "50":"a x #1"
    },
    "chrome":{
      "4":"a x #1",
      "5":"a x #1",
      "6":"a x #1",
      "7":"a x #1",
      "8":"a x #1",
      "9":"a x #1",
      "10":"a x #1",
      "11":"a x #1",
      "12":"a x #1",
      "13":"a x #1",
      "14":"a x #1",
      "15":"a x #1",
      "16":"a x #1",
      "17":"a x #1",
      "18":"a x #1",
      "19":"a x #1",
      "20":"a x #1",
      "21":"a x #1",
      "22":"a x #1",
      "23":"a x #1",
      "24":"a x #1",
      "25":"a x #1",
      "26":"a x #1",
      "27":"a x #1",
      "28":"a x #1",
      "29":"a x #1",
      "30":"a x #1",
      "31":"a x #1",
      "32":"a x #1",
      "33":"a x #1",
      "34":"a x #1",
      "35":"a x #1",
      "36":"a x #1",
      "37":"a x #1",
      "38":"a x #1",
      "39":"a x #1",
      "40":"a x #1",
      "41":"a x #1",
      "42":"a x #1",
      "43":"a x #1",
      "44":"a x #1",
      "45":"a x #1",
      "46":"a x #1",
      "47":"a x #1",
      "48":"a x #1",
      "49":"a x #1",
      "50":"a x #1",
      "51":"a x #1",
      "52":"a x #1",
      "53":"a x #1",
      "54":"a x #1"
    },
    "safari":{
      "3.1":"a x #1",
      "3.2":"a x #1",
      "4":"a x #1",
      "5":"a x #1",
      "5.1":"a x #1",
      "6":"a x #1",
      "6.1":"a x #1",
      "7":"a x #1",
      "7.1":"a x #1",
      "8":"a x #1",
      "9":"a x #1",
      "9.1":"a x #1",
      "10":"a x #1",
      "TP":"a x #1"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"n",
      "12":"n",
      "12.1":"n",
      "15":"a x #1",
      "16":"a x #1",
      "17":"a x #1",
      "18":"a x #1",
      "19":"a x #1",
      "20":"a x #1",
      "21":"a x #1",
      "22":"a x #1",
      "23":"a x #1",
      "24":"a x #1",
      "25":"a x #1",
      "26":"a x #1",
      "27":"a x #1",
      "28":"a x #1",
      "29":"a x #1",
      "30":"a x #1",
      "31":"a x #1",
      "32":"a x #1",
      "33":"a x #1",
      "34":"a x #1",
      "35":"a x #1",
      "36":"a x #1",
      "37":"a x #1",
      "38":"a x #1",
      "39":"a x #1",
      "40":"a x #1"
    },
    "ios_saf":{
      "3.2":"a x #1",
      "4.0-4.1":"a x #1",
      "4.2-4.3":"a x #1",
      "5.0-5.1":"a x #1",
      "6.0-6.1":"a x #1",
      "7.0-7.1":"a x #1",
      "8":"a x #1",
      "8.1-8.4":"a x #1",
      "9.0-9.2":"a x #1",
      "9.3":"a x #1"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"a x #1",
      "2.2":"a x #1",
      "2.3":"a x #1",
      "3":"a x #1",
      "4":"a x #1",
      "4.1":"a x #1",
      "4.2-4.3":"a x #1",
      "4.4":"a x #1",
      "4.4.3-4.4.4":"a x #1",
      "50":"a x #1"
    },
    "bb":{
      "7":"a x #1",
      "10":"a x #1"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "12":"n",
      "12.1":"n",
      "37":"a x #1"
    },
    "and_chr":{
      "51":"a x #1"
    },
    "and_ff":{
      "46":"a x #1"
    },
    "ie_mob":{
      "10":"n",
      "11":"a #1 #2"
    },
    "and_uc":{
      "9.9":"a x #1"
    },
    "samsung":{
      "4":"a x #1"
    }
  },
  "notes":"",
  "notes_by_num":{
    "1":"The appearance property is supported with the `none` value, but not `auto`. Webkit, Blink, and Gecko browsers also support additional vendor specific values.",
    "2":"Microsoft Edge and IE Mobile support this property with the `-webkit-` prefix, rather than `-ms-` for interop reasons."
  },
  "usage_perc_y":0,
  "usage_perc_a":86.53,
  "ucprefix":false,
  "parent":"",
  "keywords":"",
  "ie_id":"",
  "chrome_id":"",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],66:[function(require,module,exports){
module.exports={
  "title":"CSS box-decoration-break",
  "description":"Controls whether the box's margins, borders, padding, and other decorations wrap the broken edges of the box fragments (when the box is split by a break (page/column/region/line).",
  "spec":"http://www.w3.org/TR/css3-break/#break-decoration",
  "status":"wd",
  "links":[
    {
      "url":"https://developer.mozilla.org/en-US/docs/Web/CSS/box-decoration-break",
      "title":"MDN article"
    },
    {
      "url":"http://jsbin.com/xojoro/edit?css,output",
      "title":"Demo of effect on box border"
    },
    {
      "url":"https://wpdev.uservoice.com/forums/257854-microsoft-edge-developer/suggestions/6514472-box-decoration-break",
      "title":"Microsoft Edge feature request on UserVoice"
    }
  ],
  "bugs":[
    
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n"
    },
    "edge":{
      "12":"n",
      "13":"n",
      "14":"u"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"n",
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"n",
      "25":"n",
      "26":"n",
      "27":"n",
      "28":"n",
      "29":"n",
      "30":"n",
      "31":"n",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y"
    },
    "chrome":{
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"a x #1",
      "23":"a x #1",
      "24":"a x #1",
      "25":"a x #1",
      "26":"a x #1",
      "27":"a x #1",
      "28":"a x #1",
      "29":"a x #1",
      "30":"a x #1",
      "31":"a x #1",
      "32":"a x #1",
      "33":"a x #1",
      "34":"a x #1",
      "35":"a x #1",
      "36":"a x #1",
      "37":"a x #1",
      "38":"a x #1",
      "39":"a x #1",
      "40":"a x #1",
      "41":"a x #1",
      "42":"a x #1",
      "43":"a x #1",
      "44":"a x #1",
      "45":"a x #1",
      "46":"a x #1",
      "47":"a x #1",
      "48":"a x #1",
      "49":"a x #1",
      "50":"a x #1",
      "51":"a x #1",
      "52":"a x #1",
      "53":"a x #1",
      "54":"a x #1"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"n",
      "5":"n",
      "5.1":"n",
      "6":"n",
      "6.1":"a x #1",
      "7":"a x #1",
      "7.1":"a x #1",
      "8":"a x #1",
      "9":"a x #1",
      "9.1":"a x #1",
      "10":"a x #1",
      "TP":"a x #1"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"y #1",
      "11.1":"y #1",
      "11.5":"y #1",
      "11.6":"y #1",
      "12":"y #1",
      "12.1":"y #1",
      "15":"a x #1",
      "16":"a x #1",
      "17":"a x #1",
      "18":"a x #1",
      "19":"a x #1",
      "20":"a x #1",
      "21":"a x #1",
      "22":"a x #1",
      "23":"a x #1",
      "24":"a x #1",
      "25":"a x #1",
      "26":"a x #1",
      "27":"a x #1",
      "28":"a x #1",
      "29":"a x #1",
      "30":"a x #1",
      "31":"a x #1",
      "32":"a x #1",
      "33":"a x #1",
      "34":"a x #1",
      "35":"a x #1",
      "36":"a x #1",
      "37":"a x #1",
      "38":"a x #1",
      "39":"a x #1",
      "40":"a x #1"
    },
    "ios_saf":{
      "3.2":"n",
      "4.0-4.1":"n",
      "4.2-4.3":"n",
      "5.0-5.1":"n",
      "6.0-6.1":"n",
      "7.0-7.1":"a x #1",
      "8":"a x #1",
      "8.1-8.4":"a x #1",
      "9.0-9.2":"a x #1",
      "9.3":"a x #1"
    },
    "op_mini":{
      "all":"a #1"
    },
    "android":{
      "2.1":"n",
      "2.2":"n",
      "2.3":"n",
      "3":"n",
      "4":"n",
      "4.1":"n",
      "4.2-4.3":"n",
      "4.4":"a x #1",
      "4.4.3-4.4.4":"a x #1",
      "50":"a x #1"
    },
    "bb":{
      "7":"n",
      "10":"a x #1"
    },
    "op_mob":{
      "10":"n",
      "11":"y #1",
      "11.1":"y #1",
      "11.5":"y #1",
      "12":"y #1",
      "12.1":"y #1",
      "37":"a x #1"
    },
    "and_chr":{
      "51":"a x #1"
    },
    "and_ff":{
      "46":"y"
    },
    "ie_mob":{
      "10":"n",
      "11":"n"
    },
    "and_uc":{
      "9.9":"n"
    },
    "samsung":{
      "4":"a x #1"
    }
  },
  "notes":"",
  "notes_by_num":{
    "1":"Partial support refers to working for inline elements but not across column or page breaks."
  },
  "usage_perc_y":7.74,
  "usage_perc_a":72.75,
  "ucprefix":false,
  "parent":"",
  "keywords":"box-decoration,box decoration,break",
  "ie_id":"",
  "chrome_id":"",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],67:[function(require,module,exports){
module.exports={
  "title":"CSS3 Box-shadow",
  "description":"Method of displaying an inner or outer shadow effect to elements",
  "spec":"http://www.w3.org/TR/css3-background/#box-shadow",
  "status":"cr",
  "links":[
    {
      "url":"https://developer.mozilla.org/En/CSS/-moz-box-shadow",
      "title":"MDN article"
    },
    {
      "url":"http://westciv.com/tools/boxshadows/index.html",
      "title":"Live editor"
    },
    {
      "url":"http://tests.themasta.com/blogstuff/boxshadowdemo.html",
      "title":"Demo of various effects"
    },
    {
      "url":"http://www.css3files.com/shadow/",
      "title":"Information page"
    },
    {
      "url":"http://docs.webplatform.org/wiki/css/properties/box-shadow",
      "title":"WebPlatform Docs"
    }
  ],
  "bugs":[
    {
      "description":"Edge and IE up to 11 suppress box-shadow in tables with border-collapse:collapse. [test case](http://codepen.io/Fyrd/pen/oXVYyq)"
    },
    {
      "description":"Safari 6, iOS 6 and Android 2.3 default browser don't work with a 0px value for \"blur-radius\".\r\ne.g. `-webkit-box-shadow: 5px 1px 0px 1px #f04e29;`\r\ndoesn't work, but\r\n`-webkit-box-shadow: 5px 1px 1px 1px #f04e29`\r\ndoes."
    },
    {
      "description":"iOS 8 has a bug where the box shadow disappears when zooming in a certain amount. [test case](http://jsfiddle.net/b6aaq57z/4/)"
    }
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"y",
      "10":"y",
      "11":"y"
    },
    "edge":{
      "12":"y",
      "13":"y",
      "14":"y"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"y x",
      "3.6":"y x",
      "4":"y",
      "5":"y",
      "6":"y",
      "7":"y",
      "8":"y",
      "9":"y",
      "10":"y",
      "11":"y",
      "12":"y",
      "13":"y",
      "14":"y",
      "15":"y",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y"
    },
    "chrome":{
      "4":"y x",
      "5":"y x",
      "6":"y x",
      "7":"y x",
      "8":"y x",
      "9":"y x",
      "10":"y",
      "11":"y",
      "12":"y",
      "13":"y",
      "14":"y",
      "15":"y",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y",
      "51":"y",
      "52":"y",
      "53":"y",
      "54":"y"
    },
    "safari":{
      "3.1":"a x #1",
      "3.2":"a x #1",
      "4":"a x #1",
      "5":"y x",
      "5.1":"y",
      "6":"y",
      "6.1":"y",
      "7":"y",
      "7.1":"y",
      "8":"y",
      "9":"y",
      "9.1":"y",
      "10":"y",
      "TP":"y"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"y",
      "10.6":"y",
      "11":"y",
      "11.1":"y",
      "11.5":"y",
      "11.6":"y",
      "12":"y",
      "12.1":"y",
      "15":"y",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y"
    },
    "ios_saf":{
      "3.2":"a x #1",
      "4.0-4.1":"y x",
      "4.2-4.3":"y x",
      "5.0-5.1":"y",
      "6.0-6.1":"y",
      "7.0-7.1":"y",
      "8":"y",
      "8.1-8.4":"y",
      "9.0-9.2":"y",
      "9.3":"y"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"a x #1",
      "2.2":"a x #1",
      "2.3":"a x #1",
      "3":"a x #1",
      "4":"y",
      "4.1":"y",
      "4.2-4.3":"y",
      "4.4":"y",
      "4.4.3-4.4.4":"y",
      "50":"y"
    },
    "bb":{
      "7":"y x",
      "10":"y"
    },
    "op_mob":{
      "10":"n",
      "11":"y",
      "11.1":"y",
      "11.5":"y",
      "12":"y",
      "12.1":"y",
      "37":"y"
    },
    "and_chr":{
      "51":"y"
    },
    "and_ff":{
      "46":"y"
    },
    "ie_mob":{
      "10":"y",
      "11":"y"
    },
    "and_uc":{
      "9.9":"y"
    },
    "samsung":{
      "4":"y"
    }
  },
  "notes":"Can be partially emulated in older IE versions using the non-standard \"shadow\" filter.",
  "notes_by_num":{
    "1":"Partial support in Safari, iOS Safari and Android Browser refers to missing \"inset\", blur radius value, and multiple shadow support."
  },
  "usage_perc_y":92.51,
  "usage_perc_a":0.04,
  "ucprefix":false,
  "parent":"",
  "keywords":"box-shadows,boxshadows,box shadow,shaow",
  "ie_id":"",
  "chrome_id":"",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],68:[function(require,module,exports){
module.exports={
  "title":"Crisp edges/pixelated images",
  "description":"Scales images with an algorithm that preserves edges and contrast, without smoothing colors or introducing blur. This is intended for images such as pixel art. Official values that accomplish this for the `image-rendering` property are `crisp-edges` and `pixelated`.",
  "spec":"http://dev.w3.org/csswg/css-images-3/#valdef-image-rendering-crisp-edges",
  "status":"unoff",
  "links":[
    {
      "url":"https://developer.mozilla.org/en-US/docs/Web/CSS/image-rendering",
      "title":"MDN article"
    },
    {
      "url":"http://updates.html5rocks.com/2015/01/pixelated",
      "title":"HTML5Rocks article"
    }
  ],
  "bugs":[
    {
      "description":"`image-rendering:-webkit-optimize-contrast;` and `-ms-interpolation-mode:nearest-neighbor` do not affect CSS images."
    }
  ],
  "categories":[
    "CSS",
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"a x #2 #5",
      "8":"a x #2 #5",
      "9":"a x #2 #5",
      "10":"a x #2 #5",
      "11":"a x #2 #5"
    },
    "edge":{
      "12":"n",
      "13":"n",
      "14":"u"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"y x #3",
      "4":"y x #3",
      "5":"y x #3",
      "6":"y x #3",
      "7":"y x #3",
      "8":"y x #3",
      "9":"y x #3",
      "10":"y x #3",
      "11":"y x #3",
      "12":"y x #3",
      "13":"y x #3",
      "14":"y x #3",
      "15":"y x #3",
      "16":"y x #3",
      "17":"y x #3",
      "18":"y x #3",
      "19":"y x #3",
      "20":"y x #3",
      "21":"y x #3",
      "22":"y x #3",
      "23":"y x #3",
      "24":"y x #3",
      "25":"y x #3",
      "26":"y x #3",
      "27":"y x #3",
      "28":"y x #3",
      "29":"y x #3",
      "30":"y x #3",
      "31":"y x #3",
      "32":"y x #3",
      "33":"y x #3",
      "34":"y x #3",
      "35":"y x #3",
      "36":"y x #3",
      "37":"y x #3",
      "38":"y x #3",
      "39":"y x #3",
      "40":"y x #3",
      "41":"y x #3",
      "42":"y x #3",
      "43":"y x #3",
      "44":"y x #3",
      "45":"y x #3",
      "46":"y x #3",
      "47":"y x #3",
      "48":"y x #3",
      "49":"y x #3",
      "50":"y x #3"
    },
    "chrome":{
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"n",
      "25":"n",
      "26":"n",
      "27":"n",
      "28":"n",
      "29":"n",
      "30":"n",
      "31":"n",
      "32":"n",
      "33":"n",
      "34":"n",
      "35":"n",
      "36":"n",
      "37":"n",
      "38":"n",
      "39":"n",
      "40":"n",
      "41":"y #4",
      "42":"y #4",
      "43":"y #4",
      "44":"y #4",
      "45":"y #4",
      "46":"y #4",
      "47":"y #4",
      "48":"y #4",
      "49":"y #4",
      "50":"y #4",
      "51":"y #4",
      "52":"y #4",
      "53":"y #4",
      "54":"y #4"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"n",
      "5":"n",
      "5.1":"n",
      "6":"a x #1",
      "6.1":"a x #3 #6",
      "7":"a x #3 #6",
      "7.1":"a x #3 #6",
      "8":"a x #3 #6",
      "9":"a x #3 #6",
      "9.1":"a x #3 #6",
      "10":"y",
      "TP":"y"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"y x #3",
      "12":"y x #3",
      "12.1":"y x #3",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"n",
      "25":"n",
      "26":"n",
      "27":"n",
      "28":"y #4",
      "29":"y #4",
      "30":"y #4",
      "31":"y #4",
      "32":"y #4",
      "33":"y #4",
      "34":"y #4",
      "35":"y #4",
      "36":"y #4",
      "37":"y #4",
      "38":"y #4",
      "39":"y #4",
      "40":"y #4"
    },
    "ios_saf":{
      "3.2":"n",
      "4.0-4.1":"n",
      "4.2-4.3":"n",
      "5.0-5.1":"a x #1 #6",
      "6.0-6.1":"a x #1 #6",
      "7.0-7.1":"a x #3 #6",
      "8":"a x #3 #6",
      "8.1-8.4":"a x #3 #6",
      "9.0-9.2":"a x #3 #6",
      "9.3":"a x #3 #6"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"n",
      "2.2":"n",
      "2.3":"n",
      "3":"n",
      "4":"n",
      "4.1":"n",
      "4.2-4.3":"n",
      "4.4":"n",
      "4.4.3-4.4.4":"n",
      "50":"y #4"
    },
    "bb":{
      "7":"n",
      "10":"a x #1 #6"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "12":"y x #3",
      "12.1":"y x #3",
      "37":"y #4"
    },
    "and_chr":{
      "51":"y #4"
    },
    "and_ff":{
      "46":"y x #3"
    },
    "ie_mob":{
      "10":"a x #2 #5",
      "11":"a x #2 #5"
    },
    "and_uc":{
      "9.9":"a x #1 #6"
    },
    "samsung":{
      "4":"y #4"
    }
  },
  "notes":"Note that prefixes apply to the value (e.g. `-moz-crisp-edges`), not the `image-rendering` property.",
  "notes_by_num":{
    "1":"Supported using the non-standard value `-webkit-optimize-contrast`",
    "2":"Internet Explorer accomplishes support using the non-standard declaration `-ms-interpolation-mode: nearest-neighbor`",
    "3":"Supports the `crisp-edges` value, but not `pixelated`.",
    "4":"Supports the `pixelated` value, but not `crisp-edges`.",
    "5":"Only works on `<img>`, not CSS backgrounds or `<canvas>`.",
    "6":"Only works on `<img>` and CSS backgrounds, _not_ `<canvas>`. "
  },
  "usage_perc_y":60.59,
  "usage_perc_a":24.89,
  "ucprefix":false,
  "parent":"",
  "keywords":"image-rendering,crisp-edges",
  "ie_id":"",
  "chrome_id":"5118058116939776",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],69:[function(require,module,exports){
module.exports={
  "title":"CSS Device Adaptation",
  "description":"A standard way to override the size of viewport in web page using the `@viewport` rule, standardizing and replacing Apple's own popular `<meta>` viewport implementation.",
  "spec":"http://www.w3.org/TR/css-device-adapt/",
  "status":"wd",
  "links":[
    {
      "url":"https://dev.opera.com/articles/view/an-introduction-to-meta-viewport-and-viewport/",
      "title":"Introduction to meta viewport and @viewport in Opera Mobile"
    },
    {
      "url":"http://msdn.microsoft.com/en-us/library/ie/hh708740(v=vs.85).aspx",
      "title":"Device adaptation in Internet Explorer 10"
    },
    {
      "url":"https://wpdev.uservoice.com/forums/257854-microsoft-edge-developer/suggestions/6777420-unprefix-and-support-all-viewport-properties",
      "title":"Microsoft Edge feature request on UserVoice"
    },
    {
      "url":"https://code.google.com/p/chromium/issues/detail?id=155477",
      "title":"Chrome tracking bug"
    },
    {
      "url":"https://bugs.webkit.org/show_bug.cgi?id=95959",
      "title":"WebKit tracking bug"
    },
    {
      "url":"https://bugzilla.mozilla.org/show_bug.cgi?id=747754",
      "title":"Mozilla tracking bug"
    }
  ],
  "bugs":[
    
  ],
  "categories":[
    "CSS"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"a x #1",
      "11":"a x #1"
    },
    "edge":{
      "12":"a x #1",
      "13":"a x #1",
      "14":"a x #1"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"n",
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"n",
      "25":"n",
      "26":"n",
      "27":"n",
      "28":"n",
      "29":"n",
      "30":"n",
      "31":"n",
      "32":"n",
      "33":"n",
      "34":"n",
      "35":"n",
      "36":"n",
      "37":"n",
      "38":"n",
      "39":"n",
      "40":"n",
      "41":"n",
      "42":"n",
      "43":"n",
      "44":"n",
      "45":"n",
      "46":"n",
      "47":"n",
      "48":"n",
      "49":"n",
      "50":"n"
    },
    "chrome":{
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"n",
      "25":"n",
      "26":"n",
      "27":"n",
      "28":"n",
      "29":"n d",
      "30":"n d",
      "31":"n d",
      "32":"n d",
      "33":"n d",
      "34":"n d",
      "35":"n d",
      "36":"n d",
      "37":"n d",
      "38":"n d",
      "39":"n d",
      "40":"n d",
      "41":"n d",
      "42":"n d",
      "43":"n d",
      "44":"n d",
      "45":"n d",
      "46":"n d",
      "47":"n d",
      "48":"n d",
      "49":"n d",
      "50":"n d",
      "51":"n d",
      "52":"n d",
      "53":"n d",
      "54":"n d"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"n",
      "5":"n",
      "5.1":"n",
      "6":"n",
      "6.1":"n",
      "7":"n",
      "7.1":"n",
      "8":"n",
      "9":"n",
      "9.1":"n",
      "10":"n",
      "TP":"n"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"n",
      "12":"n",
      "12.1":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"n",
      "25":"n",
      "26":"n",
      "27":"n",
      "28":"n",
      "29":"n",
      "30":"n",
      "31":"n",
      "32":"n",
      "33":"n",
      "34":"n",
      "35":"n",
      "36":"n",
      "37":"n",
      "38":"n",
      "39":"n",
      "40":"n"
    },
    "ios_saf":{
      "3.2":"n",
      "4.0-4.1":"n",
      "4.2-4.3":"n",
      "5.0-5.1":"n",
      "6.0-6.1":"n",
      "7.0-7.1":"n",
      "8":"n",
      "8.1-8.4":"n",
      "9.0-9.2":"n",
      "9.3":"n"
    },
    "op_mini":{
      "all":"a x #2"
    },
    "android":{
      "2.1":"n",
      "2.2":"n",
      "2.3":"n",
      "3":"n",
      "4":"n",
      "4.1":"n",
      "4.2-4.3":"n",
      "4.4":"n",
      "4.4.3-4.4.4":"n",
      "50":"n"
    },
    "bb":{
      "7":"n",
      "10":"n"
    },
    "op_mob":{
      "10":"n",
      "11":"a x #2",
      "11.1":"a x #2",
      "11.5":"a x #2",
      "12":"a x #2",
      "12.1":"a x #2",
      "37":"n"
    },
    "and_chr":{
      "51":"n"
    },
    "and_ff":{
      "46":"n"
    },
    "ie_mob":{
      "10":"a x #1",
      "11":"a x #1"
    },
    "and_uc":{
      "9.9":"n"
    },
    "samsung":{
      "4":"n"
    }
  },
  "notes":"",
  "notes_by_num":{
    "1":"IE only supports the 'width' and 'height' properties.",
    "2":"Opera Mobile and Opera Mini only support the 'orientation' property."
  },
  "usage_perc_y":0,
  "usage_perc_a":12.22,
  "ucprefix":false,
  "parent":"",
  "keywords":"viewport",
  "ie_id":"",
  "chrome_id":"4737164243894272",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],70:[function(require,module,exports){
module.exports={
  "title":"CSS Filter Effects",
  "description":"Method of applying filter effects (like blur, grayscale, brightness, contrast and hue) to elements, previously only possible by using SVG.",
  "spec":"http://www.w3.org/TR/filter-effects-1/",
  "status":"wd",
  "links":[
    {
      "url":"http://html5-demos.appspot.com/static/css/filters/index.html",
      "title":"Demo file for WebKit browsers"
    },
    {
      "url":"http://www.html5rocks.com/en/tutorials/filters/understanding-css/",
      "title":"HTML5Rocks article"
    },
    {
      "url":"http://dl.dropbox.com/u/3260327/angular/CSS3ImageManipulation.html",
      "title":"Filter editor"
    },
    {
      "url":"http://bennettfeely.com/filters/",
      "title":"Filter Playground"
    }
  ],
  "bugs":[
    
  ],
  "categories":[
    "CSS",
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n"
    },
    "edge":{
      "12":"n d #2 #4",
      "13":"a #4",
      "14":"a #4"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"a #3",
      "4":"a #3",
      "5":"a #3",
      "6":"a #3",
      "7":"a #3",
      "8":"a #3",
      "9":"a #3",
      "10":"a #3",
      "11":"a #3",
      "12":"a #3",
      "13":"a #3",
      "14":"a #3",
      "15":"a #3",
      "16":"a #3",
      "17":"a #3",
      "18":"a #3",
      "19":"a #3",
      "20":"a #3",
      "21":"a #3",
      "22":"a #3",
      "23":"a #3",
      "24":"a #3",
      "25":"a #3",
      "26":"a #3",
      "27":"a #3",
      "28":"a #3",
      "29":"a #3",
      "30":"a #3",
      "31":"a #3",
      "32":"a #3",
      "33":"a #3",
      "34":"a d #1",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y"
    },
    "chrome":{
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y x",
      "27":"y x",
      "28":"y x",
      "29":"y x",
      "30":"y x",
      "31":"y x",
      "32":"y x",
      "33":"y x",
      "34":"y x",
      "35":"y x",
      "36":"y x",
      "37":"y x",
      "38":"y x",
      "39":"y x",
      "40":"y x",
      "41":"y x",
      "42":"y x",
      "43":"y x",
      "44":"y x",
      "45":"y x",
      "46":"y x",
      "47":"y x",
      "48":"y x",
      "49":"y x",
      "50":"y x",
      "51":"y x",
      "52":"y x",
      "53":"y x",
      "54":"y x"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"n",
      "5":"n",
      "5.1":"n",
      "6":"y x",
      "6.1":"y x",
      "7":"y x",
      "7.1":"y x",
      "8":"y x",
      "9":"y x",
      "9.1":"y",
      "10":"y",
      "TP":"y"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"n",
      "12":"n",
      "12.1":"n",
      "15":"y x",
      "16":"y x",
      "17":"y x",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y x",
      "27":"y x",
      "28":"y x",
      "29":"y x",
      "30":"y x",
      "31":"y x",
      "32":"y x",
      "33":"y x",
      "34":"y x",
      "35":"y x",
      "36":"y x",
      "37":"y x",
      "38":"y x",
      "39":"y x",
      "40":"y x"
    },
    "ios_saf":{
      "3.2":"n",
      "4.0-4.1":"n",
      "4.2-4.3":"n",
      "5.0-5.1":"n",
      "6.0-6.1":"y x",
      "7.0-7.1":"y x",
      "8":"y x",
      "8.1-8.4":"y x",
      "9.0-9.2":"y x",
      "9.3":"y"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"n",
      "2.2":"n",
      "2.3":"n",
      "3":"n",
      "4":"n",
      "4.1":"n",
      "4.2-4.3":"n",
      "4.4":"y x",
      "4.4.3-4.4.4":"y x",
      "50":"y x"
    },
    "bb":{
      "7":"n",
      "10":"y x"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "12":"n",
      "12.1":"n",
      "37":"y x"
    },
    "and_chr":{
      "51":"y x"
    },
    "and_ff":{
      "46":"y"
    },
    "ie_mob":{
      "10":"n",
      "11":"n"
    },
    "and_uc":{
      "9.9":"y x"
    },
    "samsung":{
      "4":"y x"
    }
  },
  "notes":"Note that this property is significantly different from and incompatible with Microsoft's [older \"filter\" property](http://msdn.microsoft.com/en-us/library/ie/ms530752%28v=vs.85%29.aspx).",
  "notes_by_num":{
    "1":"Supported in Firefox under the `layout.css.filters.enabled` flag.",
    "2":"Supported in MS Edge under the \"Enable CSS filter property\" flag.",
    "3":"Partial support in Firefox before version 34 [only implemented the url() function of the filter property](https://developer.mozilla.org/en-US/docs/Web/CSS/filter#Browser_compatibility)",
    "4":"Partial support refers to supporting filter functions, but not the `url` function."
  },
  "usage_perc_y":82.27,
  "usage_perc_a":2.11,
  "ucprefix":false,
  "parent":"",
  "keywords":"sepia,hue-rotate,invert,saturate,filter:blur",
  "ie_id":"filters",
  "chrome_id":"5822463824887808",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],71:[function(require,module,exports){
module.exports={
  "title":"CSS Gradients",
  "description":"Method of defining a linear or radial color gradient as a CSS image.",
  "spec":"http://www.w3.org/TR/css3-images/",
  "status":"cr",
  "links":[
    {
      "url":"http://www.colorzilla.com/gradient-editor/",
      "title":"Cross-browser editor"
    },
    {
      "url":"http://www.css3files.com/gradient/",
      "title":"Information page"
    },
    {
      "url":"http://css3pie.com/",
      "title":"Tool to emulate support in IE"
    },
    {
      "url":"http://docs.webplatform.org/wiki/css/functions/linear-gradient",
      "title":"WebPlatform Docs"
    }
  ],
  "bugs":[
    
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"y",
      "11":"y"
    },
    "edge":{
      "12":"y",
      "13":"y",
      "14":"y"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"y x",
      "4":"y x",
      "5":"y x",
      "6":"y x",
      "7":"y x",
      "8":"y x",
      "9":"y x",
      "10":"y x",
      "11":"y x",
      "12":"y x",
      "13":"y x",
      "14":"y x",
      "15":"y x",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y"
    },
    "chrome":{
      "4":"a x",
      "5":"a x",
      "6":"a x",
      "7":"a x",
      "8":"a x",
      "9":"a x",
      "10":"y x",
      "11":"y x",
      "12":"y x",
      "13":"y x",
      "14":"y x",
      "15":"y x",
      "16":"y x",
      "17":"y x",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y",
      "51":"y",
      "52":"y",
      "53":"y",
      "54":"y"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"a x",
      "5":"a x",
      "5.1":"y x",
      "6":"y x",
      "6.1":"y",
      "7":"y",
      "7.1":"y",
      "8":"y",
      "9":"y",
      "9.1":"y",
      "10":"y",
      "TP":"y"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"a x #1",
      "11.5":"a x #1",
      "11.6":"y x",
      "12":"y x",
      "12.1":"y",
      "15":"y",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y"
    },
    "ios_saf":{
      "3.2":"a x",
      "4.0-4.1":"a x",
      "4.2-4.3":"a x",
      "5.0-5.1":"y x",
      "6.0-6.1":"y x",
      "7.0-7.1":"y",
      "8":"y",
      "8.1-8.4":"y",
      "9.0-9.2":"y",
      "9.3":"y"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"a x",
      "2.2":"a x",
      "2.3":"a x",
      "3":"a x",
      "4":"y x",
      "4.1":"y x",
      "4.2-4.3":"y x",
      "4.4":"y",
      "4.4.3-4.4.4":"y",
      "50":"y"
    },
    "bb":{
      "7":"a x",
      "10":"y"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"a x #1",
      "11.5":"a x #1",
      "12":"y x",
      "12.1":"y",
      "37":"y"
    },
    "and_chr":{
      "51":"y"
    },
    "and_ff":{
      "46":"y"
    },
    "ie_mob":{
      "10":"y",
      "11":"y"
    },
    "and_uc":{
      "9.9":"y x"
    },
    "samsung":{
      "4":"y"
    }
  },
  "notes":"Syntax used by browsers with prefixed support may be incompatible with that for proper support.\r\n\r\nSupport can be somewhat emulated in older IE versions using the non-standard \"gradient\" filter. \r\n\r\nFirefox 10+, Opera 11.6+, Chrome 26+ and IE10+ also support the new \"to (side)\" syntax.",
  "notes_by_num":{
    "1":"Partial support in Opera 11.10 and 11.50 also refers to only having support for linear gradients."
  },
  "usage_perc_y":91.87,
  "usage_perc_a":0.2,
  "ucprefix":false,
  "parent":"",
  "keywords":"linear,linear-gradient,gradiant",
  "ie_id":"gradients",
  "chrome_id":"5785905063264256",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],72:[function(require,module,exports){
module.exports={
  "title":"CSS Hyphenation",
  "description":"Method of controlling when words at the end of lines should be hyphenated using the \"hyphens\" property.",
  "spec":"http://www.w3.org/TR/css3-text/#hyphenation",
  "status":"wd",
  "links":[
    {
      "url":"https://developer.mozilla.org/en/CSS/hyphens",
      "title":"MDN article"
    },
    {
      "url":"http://blog.fontdeck.com/post/9037028497/hyphens",
      "title":"Blog post"
    },
    {
      "url":"http://docs.webplatform.org/wiki/css/properties/hyphens",
      "title":"WebPlatform Docs"
    },
    {
      "url":"https://crbug.com/605840",
      "title":"Chrome bug for implementing hyphenation"
    }
  ],
  "bugs":[
    
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"y x",
      "11":"y x"
    },
    "edge":{
      "12":"y x",
      "13":"y x",
      "14":"y x"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"n",
      "4":"n",
      "5":"n",
      "6":"y x",
      "7":"y x",
      "8":"y x",
      "9":"y x",
      "10":"y x",
      "11":"y x",
      "12":"y x",
      "13":"y x",
      "14":"y x",
      "15":"y x",
      "16":"y x",
      "17":"y x",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y x",
      "27":"y x",
      "28":"y x",
      "29":"y x",
      "30":"y x",
      "31":"y x",
      "32":"y x",
      "33":"y x",
      "34":"y x",
      "35":"y x",
      "36":"y x",
      "37":"y x",
      "38":"y x",
      "39":"y x",
      "40":"y x",
      "41":"y x",
      "42":"y x",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y"
    },
    "chrome":{
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"n",
      "25":"n",
      "26":"n",
      "27":"n",
      "28":"n",
      "29":"n",
      "30":"n",
      "31":"n",
      "32":"n",
      "33":"n",
      "34":"n",
      "35":"n",
      "36":"n",
      "37":"n",
      "38":"n",
      "39":"n",
      "40":"n",
      "41":"n",
      "42":"n",
      "43":"n",
      "44":"n",
      "45":"n",
      "46":"n",
      "47":"n",
      "48":"n",
      "49":"n",
      "50":"n",
      "51":"n",
      "52":"n",
      "53":"n",
      "54":"n"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"n",
      "5":"n",
      "5.1":"y x",
      "6":"y x",
      "6.1":"y x",
      "7":"y x",
      "7.1":"y x",
      "8":"y x",
      "9":"y x",
      "9.1":"y x",
      "10":"y x",
      "TP":"y x"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"n",
      "12":"n",
      "12.1":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"n",
      "25":"n",
      "26":"n",
      "27":"n",
      "28":"n",
      "29":"n",
      "30":"n",
      "31":"n",
      "32":"n",
      "33":"n",
      "34":"n",
      "35":"n",
      "36":"n",
      "37":"n",
      "38":"n",
      "39":"n",
      "40":"n"
    },
    "ios_saf":{
      "3.2":"n",
      "4.0-4.1":"n",
      "4.2-4.3":"y x",
      "5.0-5.1":"y x",
      "6.0-6.1":"y x",
      "7.0-7.1":"y x",
      "8":"y x",
      "8.1-8.4":"y x",
      "9.0-9.2":"y x",
      "9.3":"y x"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"n",
      "2.2":"n",
      "2.3":"n",
      "3":"n",
      "4":"n",
      "4.1":"n",
      "4.2-4.3":"n",
      "4.4":"n",
      "4.4.3-4.4.4":"n",
      "50":"n"
    },
    "bb":{
      "7":"n",
      "10":"n"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "12":"n",
      "12.1":"n",
      "37":"n"
    },
    "and_chr":{
      "51":"n"
    },
    "and_ff":{
      "46":"y"
    },
    "ie_mob":{
      "10":"n",
      "11":"n"
    },
    "and_uc":{
      "9.9":"a x"
    },
    "samsung":{
      "4":"n"
    }
  },
  "notes":"Chrome and Android 4.0 Browser support \"-webkit-hyphens: none\", but not the \"auto\" property. It is [advisable to set the @lang attribute](http://blog.adrianroselli.com/2015/01/on-use-of-lang-attribute.html) on the HTML element to enable hyphenation support and improve accessibility.",
  "notes_by_num":{
    
  },
  "usage_perc_y":26.16,
  "usage_perc_a":6.65,
  "ucprefix":false,
  "parent":"",
  "keywords":"hyphen,shy",
  "ie_id":"",
  "chrome_id":"",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],73:[function(require,module,exports){
module.exports={
  "title":"CSS Logical Properties",
  "description":"Use start/end properties that depend on LTR or RTL writing direction instead of left/right",
  "spec":"http://dev.w3.org/csswg/css-logical-props/",
  "status":"unoff",
  "links":[
    {
      "url":"https://developer.mozilla.org/en-US/docs/Web/CSS/-moz-margin-start",
      "title":"MDN -moz-margin-start"
    },
    {
      "url":"https://developer.mozilla.org/en-US/docs/Web/CSS/-moz-padding-start",
      "title":"MDN -moz-padding-start"
    },
    {
      "url":"https://wpdev.uservoice.com/forums/257854-microsoft-edge-developer/suggestions/7438435-css-logical-properties",
      "title":"Microsoft Edge feature request on UserVoice"
    }
  ],
  "bugs":[
    
  ],
  "categories":[
    "CSS",
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n"
    },
    "edge":{
      "12":"n",
      "13":"n",
      "14":"u"
    },
    "firefox":{
      "2":"n",
      "3":"a x #1",
      "3.5":"a x #1",
      "3.6":"a x #1",
      "4":"a x #1",
      "5":"a x #1",
      "6":"a x #1",
      "7":"a x #1",
      "8":"a x #1",
      "9":"a x #1",
      "10":"a x #1",
      "11":"a x #1",
      "12":"a x #1",
      "13":"a x #1",
      "14":"a x #1",
      "15":"a x #1",
      "16":"a x #1",
      "17":"a x #1",
      "18":"a x #1",
      "19":"a x #1",
      "20":"a x #1",
      "21":"a x #1",
      "22":"a x #1",
      "23":"a x #1",
      "24":"a x #1",
      "25":"a x #1",
      "26":"a x #1",
      "27":"a x #1",
      "28":"a x #1",
      "29":"a x #1",
      "30":"a x #1",
      "31":"a x #1",
      "32":"a x #1",
      "33":"a x #1",
      "34":"a x #1",
      "35":"a x #1",
      "36":"a x #1",
      "37":"a x #1",
      "38":"a x #1",
      "39":"a x #1",
      "40":"a x #1",
      "41":"a x #1",
      "42":"a x #1",
      "43":"a x #1",
      "44":"a x #1",
      "45":"a x #1",
      "46":"a x #1",
      "47":"a x #1",
      "48":"a x #1",
      "49":"a x #1",
      "50":"a x #1"
    },
    "chrome":{
      "4":"a x #2",
      "5":"a x #2",
      "6":"a x #2",
      "7":"a x #2",
      "8":"a x #2",
      "9":"a x #2",
      "10":"a x #2",
      "11":"a x #2",
      "12":"a x #2",
      "13":"a x #2",
      "14":"a x #2",
      "15":"a x #2",
      "16":"a x #2",
      "17":"a x #2",
      "18":"a x #2",
      "19":"a x #2",
      "20":"a x #2",
      "21":"a x #2",
      "22":"a x #2",
      "23":"a x #2",
      "24":"a x #2",
      "25":"a x #2",
      "26":"a x #2",
      "27":"a x #2",
      "28":"a x #2",
      "29":"a x #2",
      "30":"a x #2",
      "31":"a x #2",
      "32":"a x #2",
      "33":"a x #2",
      "34":"a x #2",
      "35":"a x #2",
      "36":"a x #2",
      "37":"a x #2",
      "38":"a x #2",
      "39":"a x #2",
      "40":"a x #2",
      "41":"a x #2",
      "42":"a x #2",
      "43":"a x #2",
      "44":"a x #2",
      "45":"a x #2",
      "46":"a x #2",
      "47":"a x #2",
      "48":"a x #2",
      "49":"a x #2",
      "50":"a x #2",
      "51":"a x #2",
      "52":"a x #2",
      "53":"a x #2",
      "54":"a x #2"
    },
    "safari":{
      "3.1":"a x #2",
      "3.2":"a x #2",
      "4":"a x #2",
      "5":"a x #2",
      "5.1":"a x #2",
      "6":"a x #2",
      "6.1":"a x #2",
      "7":"a x #2",
      "7.1":"a x #2",
      "8":"a x #2",
      "9":"a x #2",
      "9.1":"a x #2",
      "10":"a x #2",
      "TP":"a x #2"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"n",
      "12":"n",
      "12.1":"n",
      "15":"a x #2",
      "16":"a x #2",
      "17":"a x #2",
      "18":"a x #2",
      "19":"a x #2",
      "20":"a x #2",
      "21":"a x #2",
      "22":"a x #2",
      "23":"a x #2",
      "24":"a x #2",
      "25":"a x #2",
      "26":"a x #2",
      "27":"a x #2",
      "28":"a x #2",
      "29":"a x #2",
      "30":"a x #2",
      "31":"a x #2",
      "32":"a x #2",
      "33":"a x #2",
      "34":"a x #2",
      "35":"a x #2",
      "36":"a x #2",
      "37":"a x #2",
      "38":"a x #2",
      "39":"a x #2",
      "40":"a x #2"
    },
    "ios_saf":{
      "3.2":"a x #2",
      "4.0-4.1":"a x #2",
      "4.2-4.3":"a x #2",
      "5.0-5.1":"a x #2",
      "6.0-6.1":"a x #2",
      "7.0-7.1":"a x #2",
      "8":"a x #2",
      "8.1-8.4":"a x #2",
      "9.0-9.2":"a x #2",
      "9.3":"a x #2"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"a x #2",
      "2.2":"a x #2",
      "2.3":"a x #2",
      "3":"a x #2",
      "4":"a x #2",
      "4.1":"a x #2",
      "4.2-4.3":"a x #2",
      "4.4":"a x #2",
      "4.4.3-4.4.4":"a x #2",
      "50":"a x #2"
    },
    "bb":{
      "7":"a x #2",
      "10":"a x #2"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "12":"n",
      "12.1":"n",
      "37":"a x #2"
    },
    "and_chr":{
      "51":"a x #2"
    },
    "and_ff":{
      "46":"a x #1"
    },
    "ie_mob":{
      "10":"n",
      "11":"n"
    },
    "and_uc":{
      "9.9":"a x #2"
    },
    "samsung":{
      "4":"a x #2"
    }
  },
  "notes":"",
  "notes_by_num":{
    "1":"Only supports the *-start, and *-end values for `margin`, `border` and `padding`, not the inline/block type values as defined in the spec.",
    "2":"Like #1 but also supports `*-before` and `*-end` for `*-block-start` and `*-block-end` properties as well as `start` and `end` values for `text-align`"
  },
  "usage_perc_y":0,
  "usage_perc_a":84.47,
  "ucprefix":false,
  "parent":"",
  "keywords":"margin-start,margin-end,padding-start,padding-end,border-start,border-end,inline-start,inline-end,block-start,block-end",
  "ie_id":"csslogicalpropertieslevel1",
  "chrome_id":"",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],74:[function(require,module,exports){
module.exports={
  "title":"CSS Masks",
  "description":"Method of displaying part of an element, using a selected image as a mask",
  "spec":"http://www.w3.org/TR/css-masking-1/",
  "status":"cr",
  "links":[
    {
      "url":"http://docs.webplatform.org/wiki/css/properties/mask",
      "title":"WebPlatform Docs"
    },
    {
      "url":"http://www.html5rocks.com/en/tutorials/masking/adobe/",
      "title":"HTML5 Rocks article"
    },
    {
      "url":"http://thenittygritty.co/css-masking",
      "title":"Detailed blog post"
    },
    {
      "url":"https://bugzilla.mozilla.org/show_bug.cgi?id=1224422",
      "title":"Firefox implementation bug"
    }
  ],
  "bugs":[
    
  ],
  "categories":[
    "CSS"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n"
    },
    "edge":{
      "12":"n",
      "13":"n",
      "14":"u"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"a #2",
      "3.6":"a #2",
      "4":"a #2",
      "5":"a #2",
      "6":"a #2",
      "7":"a #2",
      "8":"a #2",
      "9":"a #2",
      "10":"a #2",
      "11":"a #2",
      "12":"a #2",
      "13":"a #2",
      "14":"a #2",
      "15":"a #2",
      "16":"a #2",
      "17":"a #2",
      "18":"a #2",
      "19":"a #2",
      "20":"a #2",
      "21":"a #2",
      "22":"a #2",
      "23":"a #2",
      "24":"a #2",
      "25":"a #2",
      "26":"a #2",
      "27":"a #2",
      "28":"a #2",
      "29":"a #2",
      "30":"a #2",
      "31":"a #2",
      "32":"a #2",
      "33":"a #2",
      "34":"a #2",
      "35":"a #2",
      "36":"a #2",
      "37":"a #2",
      "38":"a #2",
      "39":"a #2",
      "40":"a #2",
      "41":"a #2",
      "42":"a #2",
      "43":"a #2",
      "44":"a #2",
      "45":"a #2",
      "46":"a #2",
      "47":"a #2",
      "48":"a #2",
      "49":"a #2",
      "50":"a #2"
    },
    "chrome":{
      "4":"a x #1",
      "5":"a x #1",
      "6":"a x #1",
      "7":"a x #1",
      "8":"a x #1",
      "9":"a x #1",
      "10":"a x #1",
      "11":"a x #1",
      "12":"a x #1",
      "13":"a x #1",
      "14":"a x #1",
      "15":"a x #1",
      "16":"a x #1",
      "17":"a x #1",
      "18":"a x #1",
      "19":"a x #1",
      "20":"a x #1",
      "21":"a x #1",
      "22":"a x #1",
      "23":"a x #1",
      "24":"a x #1",
      "25":"a x #1",
      "26":"a x #1",
      "27":"a x #1",
      "28":"a x #1",
      "29":"a x #1",
      "30":"a x #1",
      "31":"a x #1",
      "32":"a x #1",
      "33":"a x #1",
      "34":"a x #1",
      "35":"a x #1",
      "36":"a x #1",
      "37":"a x #1",
      "38":"a x #1",
      "39":"a x #1",
      "40":"a x #1",
      "41":"a x #1",
      "42":"a x #1",
      "43":"a x #1",
      "44":"a x #1",
      "45":"a x #1",
      "46":"a x #1",
      "47":"a x #1",
      "48":"a x #1",
      "49":"a x #1",
      "50":"a x #1",
      "51":"a x #1",
      "52":"a x #1",
      "53":"a x #1",
      "54":"a x #1"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"a x #1",
      "5":"a x #1",
      "5.1":"a x #1",
      "6":"a x #1",
      "6.1":"a x #1",
      "7":"a x #1",
      "7.1":"a x #1",
      "8":"a x #1",
      "9":"a x #1",
      "9.1":"a x #1",
      "10":"a x #1",
      "TP":"a x #1"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"n",
      "12":"n",
      "12.1":"n",
      "15":"a x #1",
      "16":"a x #1",
      "17":"a x #1",
      "18":"a x #1",
      "19":"a x #1",
      "20":"a x #1",
      "21":"a x #1",
      "22":"a x #1",
      "23":"a x #1",
      "24":"a x #1",
      "25":"a x #1",
      "26":"a x #1",
      "27":"a x #1",
      "28":"a x #1",
      "29":"a x #1",
      "30":"a x #1",
      "31":"a x #1",
      "32":"a x #1",
      "33":"a x #1",
      "34":"a x #1",
      "35":"a x #1",
      "36":"a x #1",
      "37":"a x #1",
      "38":"a x #1",
      "39":"a x #1",
      "40":"a x #1"
    },
    "ios_saf":{
      "3.2":"a x #1",
      "4.0-4.1":"a x #1",
      "4.2-4.3":"a x #1",
      "5.0-5.1":"a x #1",
      "6.0-6.1":"a x #1",
      "7.0-7.1":"a x #1",
      "8":"a x #1",
      "8.1-8.4":"a x #1",
      "9.0-9.2":"a x #1",
      "9.3":"a x #1"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"a x #1",
      "2.2":"a x #1",
      "2.3":"a x #1",
      "3":"a x #1",
      "4":"a x #1",
      "4.1":"a x #1",
      "4.2-4.3":"a x #1",
      "4.4":"a x #1",
      "4.4.3-4.4.4":"a x #1",
      "50":"a x #1"
    },
    "bb":{
      "7":"a x #1",
      "10":"a x #1"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "12":"n",
      "12.1":"n",
      "37":"a x #1"
    },
    "and_chr":{
      "51":"a x #1"
    },
    "and_ff":{
      "46":"a #2"
    },
    "ie_mob":{
      "10":"n",
      "11":"n"
    },
    "and_uc":{
      "9.9":"a x #1"
    },
    "samsung":{
      "4":"a x #1"
    }
  },
  "notes":"",
  "notes_by_num":{
    "1":"Partial support in WebKit/Blink browsers refers to supporting the mask-image and mask-box-image properties, but lacking support for other parts of the spec.",
    "2":"Partial support in Firefox refers to only support for inline SVG mask elements i.e. mask: url(#foo)."
  },
  "usage_perc_y":0,
  "usage_perc_a":84.41,
  "ucprefix":false,
  "parent":"",
  "keywords":"clip,clip-path,clip-rule,mask,mask-border,mask-clip,mask-image,mask-mode,mask-type",
  "ie_id":"masks",
  "chrome_id":"5381559662149632",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],75:[function(require,module,exports){
module.exports={
  "title":"Media Queries: resolution feature",
  "description":"Allows a media query to be set based on the device pixels used per CSS unit. While the standard uses `min`/`max-resolution` for this, some browsers support the older non-standard `device-pixel-ratio` media query.",
  "spec":"http://www.w3.org/TR/css3-mediaqueries/#resolution",
  "status":"rec",
  "links":[
    {
      "url":"http://www.w3.org/blog/CSS/2012/06/14/unprefix-webkit-device-pixel-ratio/",
      "title":"How to unprefix -webkit-device-pixel-ratio"
    },
    {
      "url":"https://bugs.webkit.org/show_bug.cgi?id=78087",
      "title":"WebKit Bug 78087: Implement the 'resolution' media query"
    },
    {
      "url":"https://compat.spec.whatwg.org/#css-media-queries-webkit-device-pixel-ratio",
      "title":"WHATWG Compatibility Standard: -webkit-device-pixel-ratio"
    }
  ],
  "bugs":[
    {
      "description":"Microsoft Edge has a bug where `min-resolution` less than `1dpcm` [is ignored](http://jsfiddle.net/behmjd5t/)."
    }
  ],
  "categories":[
    "CSS",
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"a #1",
      "10":"a #1",
      "11":"a #1"
    },
    "edge":{
      "12":"y",
      "13":"y",
      "14":"y"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"a #2",
      "3.6":"a #2",
      "4":"a #2",
      "5":"a #2",
      "6":"a #2",
      "7":"a #2",
      "8":"a #2",
      "9":"a #2",
      "10":"a #2",
      "11":"a #2",
      "12":"a #2",
      "13":"a #2",
      "14":"a #2",
      "15":"a #2",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y"
    },
    "chrome":{
      "4":"a x #3",
      "5":"a x #3",
      "6":"a x #3",
      "7":"a x #3",
      "8":"a x #3",
      "9":"a x #3",
      "10":"a x #3",
      "11":"a x #3",
      "12":"a x #3",
      "13":"a x #3",
      "14":"a x #3",
      "15":"a x #3",
      "16":"a x #3",
      "17":"a x #3",
      "18":"a x #3",
      "19":"a x #3",
      "20":"a x #3",
      "21":"a x #3",
      "22":"a x #3",
      "23":"a x #3",
      "24":"a x #3",
      "25":"a x #3",
      "26":"a x #3",
      "27":"a x #3",
      "28":"a x #3",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y",
      "51":"y",
      "52":"y",
      "53":"y",
      "54":"y"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"a x #3",
      "5":"a x #3",
      "5.1":"a x #3",
      "6":"a x #3",
      "6.1":"a x #3",
      "7":"a x #3",
      "7.1":"a x #3",
      "8":"a x #3",
      "9":"a x #3",
      "9.1":"a x #3",
      "10":"a x #3",
      "TP":"a x #3"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"a x #3",
      "10.0-10.1":"a x #3",
      "10.5":"a x #3",
      "10.6":"a x #3",
      "11":"a x #3",
      "11.1":"a x #3",
      "11.5":"a x #3",
      "11.6":"a x #3",
      "12":"a x #3",
      "12.1":"y",
      "15":"y",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y"
    },
    "ios_saf":{
      "3.2":"u",
      "4.0-4.1":"a x #3",
      "4.2-4.3":"a x #3",
      "5.0-5.1":"a x #3",
      "6.0-6.1":"a x #3",
      "7.0-7.1":"a x #3",
      "8":"a x #3",
      "8.1-8.4":"a x #3",
      "9.0-9.2":"a x #3",
      "9.3":"a x #3"
    },
    "op_mini":{
      "all":"a #1"
    },
    "android":{
      "2.1":"u",
      "2.2":"u",
      "2.3":"a x #3",
      "3":"a x #3",
      "4":"a x #3",
      "4.1":"a x #3",
      "4.2-4.3":"a x #3",
      "4.4":"y",
      "4.4.3-4.4.4":"y",
      "50":"y"
    },
    "bb":{
      "7":"a x #3",
      "10":"a x #3"
    },
    "op_mob":{
      "10":"a x #3",
      "11":"a x #3",
      "11.1":"a x #3",
      "11.5":"a x #3",
      "12":"a x #3",
      "12.1":"y",
      "37":"y"
    },
    "and_chr":{
      "51":"y"
    },
    "and_ff":{
      "46":"y"
    },
    "ie_mob":{
      "10":"a #1",
      "11":"a #1"
    },
    "and_uc":{
      "9.9":"a x #3"
    },
    "samsung":{
      "4":"y"
    }
  },
  "notes":"",
  "notes_by_num":{
    "1":"Supports the `dpi` unit, but does not support `dppx` or `dpcm` units.",
    "2":"Firefox before 16 supports only `dpi` unit, but you can set `2dppx` per `min--moz-device-pixel-ratio: 2`",
    "3":"Supports the non-standard `min`/`max-device-pixel-ratio`"
  },
  "usage_perc_y":66.37,
  "usage_perc_a":30.89,
  "ucprefix":false,
  "parent":"css-mediaqueries",
  "keywords":"@media,device-pixel-ratio,resolution,dppx,dpcm,dpi",
  "ie_id":"mediaqueriesresolutionfeature,dppxunitfortheresolutionmediaquery",
  "chrome_id":"5944509615570944",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],76:[function(require,module,exports){
module.exports={
  "title":"::placeholder CSS pseudo-element",
  "description":"The ::placeholder pseudo-element represents placeholder text in an input field: text that represents the input and provides a hint to the user on how to fill out the form. For example, a date-input field might have the placeholder text `YYYY/MM/DD` to clarify that numeric dates are to be entered in year-month-day order.",
  "spec":"http://dev.w3.org/csswg/css-pseudo-4/#placeholder-pseudo",
  "status":"wd",
  "links":[
    {
      "url":"http://msdn.microsoft.com/en-us/library/ie/hh772745(v=vs.85).aspx",
      "title":"MSDN article"
    },
    {
      "url":"http://css-tricks.com/snippets/css/style-placeholder-text/",
      "title":"CSS-Tricks article with all prefixes"
    },
    {
      "url":"http://wiki.csswg.org/ideas/placeholder-styling",
      "title":"CSSWG discussion"
    },
    {
      "url":"https://developer.mozilla.org/en-US/docs/Web/CSS/::-moz-placeholder",
      "title":"MDN article"
    },
    {
      "url":"https://bugzilla.mozilla.org/show_bug.cgi?id=1069012",
      "title":"Mozilla Bug 1069012 - unprefix :placeholder-shown pseudo-class and ::placeholder pseudo-element"
    }
  ],
  "bugs":[
    
  ],
  "categories":[
    "CSS"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"a x",
      "11":"a x"
    },
    "edge":{
      "12":"a x",
      "13":"a x",
      "14":"a x"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"n",
      "4":"a x #1",
      "5":"a x #1",
      "6":"a x #1",
      "7":"a x #1",
      "8":"a x #1",
      "9":"a x #1",
      "10":"a x #1",
      "11":"a x #1",
      "12":"a x #1",
      "13":"a x #1",
      "14":"a x #1",
      "15":"a x #1",
      "16":"a x #1",
      "17":"a x #1",
      "18":"a x #1",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y x",
      "27":"y x",
      "28":"y x",
      "29":"y x",
      "30":"y x",
      "31":"y x",
      "32":"y x",
      "33":"y x",
      "34":"y x",
      "35":"y x",
      "36":"y x",
      "37":"y x",
      "38":"y x",
      "39":"y x",
      "40":"y x",
      "41":"y x",
      "42":"y x",
      "43":"y x",
      "44":"y x",
      "45":"y x",
      "46":"y x",
      "47":"y x",
      "48":"y x",
      "49":"y x",
      "50":"y x"
    },
    "chrome":{
      "4":"a x",
      "5":"a x",
      "6":"a x",
      "7":"a x",
      "8":"a x",
      "9":"a x",
      "10":"a x",
      "11":"a x",
      "12":"a x",
      "13":"a x",
      "14":"a x",
      "15":"a x",
      "16":"a x",
      "17":"a x",
      "18":"a x",
      "19":"a x",
      "20":"a x",
      "21":"a x",
      "22":"a x",
      "23":"a x",
      "24":"a x",
      "25":"a x",
      "26":"a x",
      "27":"a x",
      "28":"a x",
      "29":"a x",
      "30":"a x",
      "31":"a x",
      "32":"a x",
      "33":"a x",
      "34":"a x",
      "35":"a x",
      "36":"a x",
      "37":"a x",
      "38":"a x",
      "39":"a x",
      "40":"a x",
      "41":"a x",
      "42":"a x",
      "43":"a x",
      "44":"a x",
      "45":"a x",
      "46":"a x",
      "47":"a x",
      "48":"a x",
      "49":"a x",
      "50":"a x",
      "51":"a x",
      "52":"a x",
      "53":"a x",
      "54":"a x"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"n",
      "5":"a x",
      "5.1":"a x",
      "6":"a x",
      "6.1":"a x",
      "7":"a x",
      "7.1":"a x",
      "8":"a x",
      "9":"a x",
      "9.1":"a x",
      "10":"a x",
      "TP":"y"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"n",
      "12":"n",
      "12.1":"n",
      "15":"a x",
      "16":"a x",
      "17":"a x",
      "18":"a x",
      "19":"a x",
      "20":"a x",
      "21":"a x",
      "22":"a x",
      "23":"a x",
      "24":"a x",
      "25":"a x",
      "26":"a x",
      "27":"a x",
      "28":"a x",
      "29":"a x",
      "30":"a x",
      "31":"a x",
      "32":"a x",
      "33":"a x",
      "34":"a x",
      "35":"a x",
      "36":"a x",
      "37":"a x",
      "38":"a x",
      "39":"a x",
      "40":"a x"
    },
    "ios_saf":{
      "3.2":"n",
      "4.0-4.1":"n",
      "4.2-4.3":"a x",
      "5.0-5.1":"a x",
      "6.0-6.1":"a x",
      "7.0-7.1":"a x",
      "8":"a x",
      "8.1-8.4":"a x",
      "9.0-9.2":"a x",
      "9.3":"a x"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"a x",
      "2.2":"a x",
      "2.3":"a x",
      "3":"a x",
      "4":"a x",
      "4.1":"a x",
      "4.2-4.3":"a x",
      "4.4":"a x",
      "4.4.3-4.4.4":"a x",
      "50":"a x"
    },
    "bb":{
      "7":"a x",
      "10":"a x"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "12":"n",
      "12.1":"n",
      "37":"a x"
    },
    "and_chr":{
      "51":"a x"
    },
    "and_ff":{
      "46":"y x"
    },
    "ie_mob":{
      "10":"a x",
      "11":"a x"
    },
    "and_uc":{
      "9.9":"a x"
    },
    "samsung":{
      "4":"a x"
    }
  },
  "notes":"Partial support refers to using alternate names:\r\n`::-webkit-input-placeholder` for Chrome/Safari/Opera ([Chrome issue #623345](https://bugs.chromium.org/p/chromium/issues/detail?id=623345))\r\n`:-ms-input-placeholder` for IE. \r\n`::-ms-input-placeholder` for Edge (also supports webkit prefix)",
  "notes_by_num":{
    "1":"Firefox 18 and below supported the `:-moz-placeholder` pseudo-class rather than the `::-moz-placeholder` pseudo-element."
  },
  "usage_perc_y":7.95,
  "usage_perc_a":83.93,
  "ucprefix":false,
  "parent":"",
  "keywords":"::placeholder,placeholder",
  "ie_id":"",
  "chrome_id":"",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],77:[function(require,module,exports){
module.exports={
  "title":"::selection CSS pseudo-element",
  "description":"The ::selection CSS pseudo-element applies rules to the portion of a document that has been highlighted (e.g., selected with the mouse or another pointing device) by the user.",
  "spec":"http://www.w3.org/TR/css-pseudo-4/#selectordef-selection",
  "status":"wd",
  "links":[
    {
      "url":"http://quirksmode.org/css/selectors/selection.html",
      "title":"::selection test"
    },
    {
      "url":"http://docs.webplatform.org/wiki/css/selectors/pseudo-elements/::selection",
      "title":"WebPlatform Docs"
    }
  ],
  "bugs":[
    {
      "description":"In Safari `::selection` styles do not work in combination with CSS multi-column."
    }
  ],
  "categories":[
    "CSS"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"y",
      "10":"y",
      "11":"y"
    },
    "edge":{
      "12":"y",
      "13":"y",
      "14":"y"
    },
    "firefox":{
      "2":"y x",
      "3":"y x",
      "3.5":"y x",
      "3.6":"y x",
      "4":"y x",
      "5":"y x",
      "6":"y x",
      "7":"y x",
      "8":"y x",
      "9":"y x",
      "10":"y x",
      "11":"y x",
      "12":"y x",
      "13":"y x",
      "14":"y x",
      "15":"y x",
      "16":"y x",
      "17":"y x",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y x",
      "27":"y x",
      "28":"y x",
      "29":"y x",
      "30":"y x",
      "31":"y x",
      "32":"y x",
      "33":"y x",
      "34":"y x",
      "35":"y x",
      "36":"y x",
      "37":"y x",
      "38":"y x",
      "39":"y x",
      "40":"y x",
      "41":"y x",
      "42":"y x",
      "43":"y x",
      "44":"y x",
      "45":"y x",
      "46":"y x",
      "47":"y x",
      "48":"y x",
      "49":"y x",
      "50":"y x"
    },
    "chrome":{
      "4":"y",
      "5":"y",
      "6":"y",
      "7":"y",
      "8":"y",
      "9":"y",
      "10":"y",
      "11":"y",
      "12":"y",
      "13":"y",
      "14":"y",
      "15":"y",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y",
      "51":"y",
      "52":"y",
      "53":"y",
      "54":"y"
    },
    "safari":{
      "3.1":"y",
      "3.2":"y",
      "4":"y",
      "5":"y",
      "5.1":"y",
      "6":"y",
      "6.1":"y",
      "7":"y",
      "7.1":"y",
      "8":"y",
      "9":"y",
      "9.1":"y",
      "10":"y",
      "TP":"y"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"y",
      "10.0-10.1":"y",
      "10.5":"y",
      "10.6":"y",
      "11":"y",
      "11.1":"y",
      "11.5":"y",
      "11.6":"y",
      "12":"y",
      "12.1":"y",
      "15":"y",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y"
    },
    "ios_saf":{
      "3.2":"n",
      "4.0-4.1":"n",
      "4.2-4.3":"n",
      "5.0-5.1":"n",
      "6.0-6.1":"n",
      "7.0-7.1":"n",
      "8":"n",
      "8.1-8.4":"n",
      "9.0-9.2":"n",
      "9.3":"n"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"n",
      "2.2":"n",
      "2.3":"n",
      "3":"n",
      "4":"n",
      "4.1":"n",
      "4.2-4.3":"n",
      "4.4":"y",
      "4.4.3-4.4.4":"y",
      "50":"y"
    },
    "bb":{
      "7":"n",
      "10":"y"
    },
    "op_mob":{
      "10":"u",
      "11":"u",
      "11.1":"u",
      "11.5":"y",
      "12":"y",
      "12.1":"y",
      "37":"y"
    },
    "and_chr":{
      "51":"y"
    },
    "and_ff":{
      "46":"y x"
    },
    "ie_mob":{
      "10":"y",
      "11":"y"
    },
    "and_uc":{
      "9.9":"n"
    },
    "samsung":{
      "4":"y"
    }
  },
  "notes":"",
  "notes_by_num":{
    
  },
  "usage_perc_y":76.03,
  "usage_perc_a":0,
  "ucprefix":false,
  "parent":"",
  "keywords":"::selection,selection",
  "ie_id":"",
  "chrome_id":"",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],78:[function(require,module,exports){
module.exports={
  "title":"CSS Shapes Level 1",
  "description":"Allows geometric shapes to be set in CSS to define an area for text to flow around.",
  "spec":"http://www.w3.org/TR/css-shapes/",
  "status":"cr",
  "links":[
    {
      "url":"http://html.adobe.com/webplatform/layout/shapes/",
      "title":"Adobe demos and samples"
    },
    {
      "url":"http://html.adobe.com/webplatform/layout/shapes/browser-support/",
      "title":"CSS shapes support test by Adobe"
    },
    {
      "url":"http://alistapart.com/article/css-shapes-101",
      "title":"A List Apart article"
    },
    {
      "url":"https://bugzilla.mozilla.org/show_bug.cgi?id=1040714",
      "title":"Firefox tracking bug"
    }
  ],
  "bugs":[
    
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n"
    },
    "edge":{
      "12":"n",
      "13":"n",
      "14":"u"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"n",
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"n",
      "25":"n",
      "26":"n",
      "27":"n",
      "28":"n",
      "29":"n",
      "30":"n",
      "31":"n",
      "32":"n",
      "33":"n",
      "34":"n",
      "35":"n",
      "36":"n",
      "37":"n",
      "38":"n",
      "39":"n",
      "40":"n",
      "41":"n",
      "42":"n",
      "43":"n",
      "44":"n",
      "45":"n",
      "46":"n",
      "47":"n",
      "48":"n",
      "49":"n",
      "50":"n"
    },
    "chrome":{
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"n",
      "25":"n",
      "26":"n",
      "27":"n",
      "28":"n",
      "29":"n",
      "30":"n",
      "31":"n",
      "32":"n",
      "33":"n",
      "34":"n d #1",
      "35":"n d #1",
      "36":"n d #1",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y",
      "51":"y",
      "52":"y",
      "53":"y",
      "54":"y"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"n",
      "5":"n",
      "5.1":"n",
      "6":"n",
      "6.1":"n",
      "7":"n",
      "7.1":"y x",
      "8":"y x",
      "9":"y x",
      "9.1":"y x",
      "10":"y x",
      "TP":"y x"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"n",
      "12":"n",
      "12.1":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y"
    },
    "ios_saf":{
      "3.2":"n",
      "4.0-4.1":"n",
      "4.2-4.3":"n",
      "5.0-5.1":"n",
      "6.0-6.1":"n",
      "7.0-7.1":"n",
      "8":"y x",
      "8.1-8.4":"y x",
      "9.0-9.2":"y x",
      "9.3":"y x"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"n",
      "2.2":"n",
      "2.3":"n",
      "3":"n",
      "4":"n",
      "4.1":"n",
      "4.2-4.3":"n",
      "4.4":"n",
      "4.4.3-4.4.4":"n",
      "50":"y"
    },
    "bb":{
      "7":"n",
      "10":"n"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "12":"n",
      "12.1":"n",
      "37":"y"
    },
    "and_chr":{
      "51":"y"
    },
    "and_ff":{
      "46":"n"
    },
    "ie_mob":{
      "10":"n",
      "11":"n"
    },
    "and_uc":{
      "9.9":"n"
    },
    "samsung":{
      "4":"y"
    }
  },
  "notes":"",
  "notes_by_num":{
    "1":"Enabled in Chrome through the \"experimental Web Platform features\" flag in chrome://flags"
  },
  "usage_perc_y":63.27,
  "usage_perc_a":0,
  "ucprefix":false,
  "parent":"",
  "keywords":"circle,ellipse,polygon,inset,shape-outside,shape-inside",
  "ie_id":"shapes",
  "chrome_id":"5163890719588352",
  "firefox_id":"css-shapes",
  "webkit_id":"feature-css-shapes-level-1",
  "shown":true
}

},{}],79:[function(require,module,exports){
module.exports={
  "title":"CSS position:sticky",
  "description":"Keeps elements positioned as \"fixed\" or \"relative\" depending on how it appears in the viewport. As a result the element is \"stuck\" when necessary while scrolling.",
  "spec":"https://drafts.csswg.org/css-position/#sticky-pos",
  "status":"unoff",
  "links":[
    {
      "url":"http://updates.html5rocks.com/2012/08/Stick-your-landings-position-sticky-lands-in-WebKit",
      "title":"HTML5Rocks"
    },
    {
      "url":"https://developer.mozilla.org/en-US/docs/Web/CSS/position",
      "title":"MDN article"
    },
    {
      "url":"http://docs.webplatform.org/wiki/css/properties/position",
      "title":"WebPlatform Docs"
    },
    {
      "url":"https://github.com/filamentgroup/fixed-sticky",
      "title":"Polyfill"
    },
    {
      "url":"https://github.com/wilddeer/stickyfill",
      "title":"Another polyfill"
    }
  ],
  "bugs":[
    {
      "description":"Firefox and Safari 7 & below do not appear to support [sticky table headers](http://jsfiddle.net/Mf4YT/2/). (see also [Firefox bug](https://bugzilla.mozilla.org/show_bug.cgi?id=975644))"
    },
    {
      "description":"A parent with overflow set to `auto` will prevent `position: sticky` from working in Safari"
    }
  ],
  "categories":[
    "CSS"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n"
    },
    "edge":{
      "12":"n",
      "13":"n",
      "14":"u"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"n",
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"n",
      "25":"n",
      "26":"n d #1",
      "27":"n d #1",
      "28":"n d #1",
      "29":"n d #1",
      "30":"n d #1",
      "31":"n d #1",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y"
    },
    "chrome":{
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n d #2",
      "24":"n d #2",
      "25":"n d #2",
      "26":"n d #2",
      "27":"n d #2",
      "28":"n d #2",
      "29":"n d #2",
      "30":"n d #2",
      "31":"n d #2",
      "32":"n d #2",
      "33":"n d #2",
      "34":"n d #2",
      "35":"n d #2",
      "36":"n d #2",
      "37":"n",
      "38":"n",
      "39":"n",
      "40":"n",
      "41":"n",
      "42":"n",
      "43":"n",
      "44":"n",
      "45":"n",
      "46":"n",
      "47":"n",
      "48":"n",
      "49":"n",
      "50":"n",
      "51":"n",
      "52":"n d #2",
      "53":"n d #2",
      "54":"n d #2"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"n",
      "5":"n",
      "5.1":"n",
      "6":"n",
      "6.1":"y x",
      "7":"y x",
      "7.1":"y x",
      "8":"y x",
      "9":"y x",
      "9.1":"y x",
      "10":"y x",
      "TP":"y x"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"n",
      "12":"n",
      "12.1":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"n",
      "25":"n",
      "26":"n",
      "27":"n",
      "28":"n",
      "29":"n",
      "30":"n",
      "31":"n",
      "32":"n",
      "33":"n",
      "34":"n",
      "35":"n",
      "36":"n",
      "37":"n",
      "38":"n",
      "39":"n d #2",
      "40":"n d #2"
    },
    "ios_saf":{
      "3.2":"n",
      "4.0-4.1":"n",
      "4.2-4.3":"n",
      "5.0-5.1":"n",
      "6.0-6.1":"y x",
      "7.0-7.1":"y x",
      "8":"y x",
      "8.1-8.4":"y x",
      "9.0-9.2":"y x",
      "9.3":"y x"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"n",
      "2.2":"n",
      "2.3":"n",
      "3":"n",
      "4":"n",
      "4.1":"n",
      "4.2-4.3":"n",
      "4.4":"n",
      "4.4.3-4.4.4":"n",
      "50":"n"
    },
    "bb":{
      "7":"n",
      "10":"n"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "12":"n",
      "12.1":"n",
      "37":"n"
    },
    "and_chr":{
      "51":"n"
    },
    "and_ff":{
      "46":"y"
    },
    "ie_mob":{
      "10":"n",
      "11":"n"
    },
    "and_uc":{
      "9.9":"n"
    },
    "samsung":{
      "4":"n"
    }
  },
  "notes":"",
  "notes_by_num":{
    "1":"Can be enabled in Firefox by setting the about:config preference layout.css.sticky.enabled to true",
    "2":"Enabled through the \"experimental Web Platform features\" flag"
  },
  "usage_perc_y":18.67,
  "usage_perc_a":0,
  "ucprefix":false,
  "parent":"",
  "keywords":"",
  "ie_id":"positionsticky",
  "chrome_id":"6190250464378880",
  "firefox_id":"",
  "webkit_id":"feature-position:-sticky",
  "shown":true
}

},{}],80:[function(require,module,exports){
module.exports={
  "title":"CSS3 text-align-last",
  "description":"CSS property to describe how the last line of a block or a line right before a forced line break when `text-align` is `justify`.",
  "spec":"http://www.w3.org/TR/css3-text/#text-align-last-property",
  "status":"wd",
  "links":[
    {
      "url":"https://developer.mozilla.org/en-US/docs/Web/CSS/text-align-last",
      "title":"MDN text-align-last"
    },
    {
      "url":"http://blogs.adobe.com/webplatform/2014/02/25/improving-your-sites-visual-details-css3-text-align-last/",
      "title":"Adobe Web Platform Article"
    }
  ],
  "bugs":[
    
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"a #1",
      "6":"a #1",
      "7":"a #1",
      "8":"a #1",
      "9":"a #1",
      "10":"a #1",
      "11":"a #1"
    },
    "edge":{
      "12":"a",
      "13":"a",
      "14":"a"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"n",
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"y x",
      "13":"y x",
      "14":"y x",
      "15":"y x",
      "16":"y x",
      "17":"y x",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y x",
      "27":"y x",
      "28":"y x",
      "29":"y x",
      "30":"y x",
      "31":"y x",
      "32":"y x",
      "33":"y x",
      "34":"y x",
      "35":"y x",
      "36":"y x",
      "37":"y x",
      "38":"y x",
      "39":"y x",
      "40":"y x",
      "41":"y x",
      "42":"y x",
      "43":"y x",
      "44":"y x",
      "45":"y x",
      "46":"y x",
      "47":"y x",
      "48":"y x",
      "49":"y",
      "50":"y"
    },
    "chrome":{
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"n",
      "25":"n",
      "26":"n",
      "27":"n",
      "28":"n",
      "29":"n",
      "30":"n",
      "31":"n",
      "32":"n",
      "33":"n",
      "34":"n",
      "35":"n d #2",
      "36":"n d #2",
      "37":"n d #2",
      "38":"n d #2",
      "39":"n d #2",
      "40":"n d #2",
      "41":"n d #2",
      "42":"n d #2",
      "43":"n d #2",
      "44":"n d #2",
      "45":"n d #2",
      "46":"n d #2",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y",
      "51":"y",
      "52":"y",
      "53":"y",
      "54":"y"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"n",
      "5":"n",
      "5.1":"n",
      "6":"n",
      "6.1":"n",
      "7":"n",
      "7.1":"n",
      "8":"n",
      "9":"n",
      "9.1":"n",
      "10":"n",
      "TP":"n"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"n",
      "12":"n",
      "12.1":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n d #3",
      "23":"n d #3",
      "24":"n d #3",
      "25":"n d #3",
      "26":"n d #3",
      "27":"n d #3",
      "28":"n d #3",
      "29":"n d #3",
      "30":"n d #3",
      "31":"n d #3",
      "32":"n d #3",
      "33":"n d #3",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y"
    },
    "ios_saf":{
      "3.2":"n",
      "4.0-4.1":"n",
      "4.2-4.3":"n",
      "5.0-5.1":"n",
      "6.0-6.1":"n",
      "7.0-7.1":"n",
      "8":"n",
      "8.1-8.4":"n",
      "9.0-9.2":"n",
      "9.3":"n"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"n",
      "2.2":"n",
      "2.3":"n",
      "3":"n",
      "4":"n",
      "4.1":"n",
      "4.2-4.3":"n",
      "4.4":"n",
      "4.4.3-4.4.4":"n",
      "50":"y"
    },
    "bb":{
      "7":"n",
      "10":"n"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "12":"n",
      "12.1":"n",
      "37":"n"
    },
    "and_chr":{
      "51":"y"
    },
    "and_ff":{
      "46":"y x"
    },
    "ie_mob":{
      "10":"a #1",
      "11":"a #1"
    },
    "and_uc":{
      "9.9":"n"
    },
    "samsung":{
      "4":"n"
    }
  },
  "notes":"",
  "notes_by_num":{
    "1":"In Internet Explorer, the start and end values are not supported.",
    "2":"Enabled through the \"Enable Experimental Web Platform Features\" flag in chrome://flags",
    "3":"Enabled through the \"Enable Experimental Web Platform Features\" flag in opera://flags"
  },
  "usage_perc_y":55.58,
  "usage_perc_a":8.66,
  "ucprefix":false,
  "parent":"",
  "keywords":"text align last",
  "ie_id":"",
  "chrome_id":"",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],81:[function(require,module,exports){
module.exports={
  "title":"CSS3 Transitions",
  "description":"Simple method of animating certain properties of an element, with ability to define property, duration, delay and timing function. ",
  "spec":"http://www.w3.org/TR/css3-transitions/",
  "status":"wd",
  "links":[
    {
      "url":"http://www.webdesignerdepot.com/2010/01/css-transitions-101/",
      "title":"Article on usage"
    },
    {
      "url":"http://www.css3files.com/transition/",
      "title":"Information page"
    },
    {
      "url":"http://www.the-art-of-web.com/css/timing-function/",
      "title":"Examples on timing functions"
    },
    {
      "url":"http://www.opera.com/docs/specs/presto2.12/css/transitions/",
      "title":"Animation of property types support in Opera"
    },
    {
      "url":"http://docs.webplatform.org/wiki/css/properties/transition",
      "title":"WebPlatform Docs"
    }
  ],
  "bugs":[
    {
      "description":"Not supported on any pseudo-elements besides ::before and ::after for Firefox, Chrome 26+, Opera 16+ and IE10+."
    },
    {
      "description":"Transitionable properties with calc() derived values are not supported below and including IE11 (http://connect.microsoft.com/IE/feedback/details/762719/css3-calc-bug-inside-transition-or-transform)"
    },
    {
      "description":"'background-size' is not supported below and including IE10"
    },
    {
      "description":"IE11 [does not support](https://connect.microsoft.com/IE/feedbackdetail/view/920928/ie-11-css-transition-property-not-working-for-svg-elements) CSS transitions on the SVG `fill` property."
    },
    {
      "description":"In Chrome (up to 43.0), for transition-delay property, either explicitly specified or written within transition property, the unit cannot be ommitted even if the value is 0."
    },
    {
      "description":"IE10 & IE11 are reported to not support transitioning the `column-count` property."
    }
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"y",
      "11":"y"
    },
    "edge":{
      "12":"y",
      "13":"y",
      "14":"y"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"n",
      "4":"y x",
      "5":"y x",
      "6":"y x",
      "7":"y x",
      "8":"y x",
      "9":"y x",
      "10":"y x",
      "11":"y x",
      "12":"y x",
      "13":"y x",
      "14":"y x",
      "15":"y x",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y"
    },
    "chrome":{
      "4":"y x",
      "5":"y x",
      "6":"y x",
      "7":"y x",
      "8":"y x",
      "9":"y x",
      "10":"y x",
      "11":"y x",
      "12":"y x",
      "13":"y x",
      "14":"y x",
      "15":"y x",
      "16":"y x",
      "17":"y x",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y",
      "51":"y",
      "52":"y",
      "53":"y",
      "54":"y"
    },
    "safari":{
      "3.1":"y x",
      "3.2":"y x",
      "4":"y x",
      "5":"y x",
      "5.1":"y x",
      "6":"y x",
      "6.1":"y",
      "7":"y",
      "7.1":"y",
      "8":"y",
      "9":"y",
      "9.1":"y",
      "10":"y",
      "TP":"y"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"y x",
      "10.6":"y x",
      "11":"y x",
      "11.1":"y x",
      "11.5":"y x",
      "11.6":"y x",
      "12":"y x",
      "12.1":"y",
      "15":"y",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y"
    },
    "ios_saf":{
      "3.2":"y x",
      "4.0-4.1":"y x",
      "4.2-4.3":"y x",
      "5.0-5.1":"y x",
      "6.0-6.1":"y x",
      "7.0-7.1":"y",
      "8":"y",
      "8.1-8.4":"y",
      "9.0-9.2":"y",
      "9.3":"y"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"y x",
      "2.2":"y x",
      "2.3":"y x",
      "3":"y x",
      "4":"y x",
      "4.1":"y x",
      "4.2-4.3":"y x",
      "4.4":"y",
      "4.4.3-4.4.4":"y",
      "50":"y"
    },
    "bb":{
      "7":"y x",
      "10":"y"
    },
    "op_mob":{
      "10":"y x",
      "11":"y x",
      "11.1":"y x",
      "11.5":"y x",
      "12":"y x",
      "12.1":"y",
      "37":"y"
    },
    "and_chr":{
      "51":"y"
    },
    "and_ff":{
      "46":"y"
    },
    "ie_mob":{
      "10":"y",
      "11":"y"
    },
    "and_uc":{
      "9.9":"y x"
    },
    "samsung":{
      "4":"y"
    }
  },
  "notes":"Support listed is for `transition` properties as well as the `transitionend` event. The prefixed name in WebKit browsers is `webkitTransitionEnd`",
  "notes_by_num":{
    
  },
  "usage_perc_y":92.08,
  "usage_perc_a":0,
  "ucprefix":false,
  "parent":"",
  "keywords":"css transition,transitionend,transition-property,transition-duration,transition-timing-function,transition-delay",
  "ie_id":"",
  "chrome_id":"",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],82:[function(require,module,exports){
module.exports={
  "title":"CSS3 Box-sizing",
  "description":"Method of specifying whether or not an element's borders and padding should be included in size units",
  "spec":"http://www.w3.org/TR/css3-ui/#box-sizing",
  "status":"cr",
  "links":[
    {
      "url":"https://developer.mozilla.org/En/CSS/Box-sizing",
      "title":"MDN article"
    },
    {
      "url":"http://www.456bereastreet.com/archive/201104/controlling_width_with_css3_box-sizing/",
      "title":"Blog post"
    },
    {
      "url":"https://github.com/Schepp/box-sizing-polyfill",
      "title":"Polyfill for IE"
    },
    {
      "url":"http://css-tricks.com/box-sizing/",
      "title":"CSS Tricks"
    },
    {
      "url":"http://docs.webplatform.org/wiki/css/properties/box-sizing",
      "title":"WebPlatform Docs"
    }
  ],
  "bugs":[
    {
      "description":"Android browsers do not calculate correctly the dimensions (width and height) of the HTML select element."
    },
    {
      "description":"Safari 6.0.x does not use box-sizing on elements with display: table;"
    },
    {
      "description":"IE9 will subtract the width of the scrollbar to the width of the element when set to position: absolute / fixed , overflow: auto / overflow-y: scroll"
    },
    {
      "description":"IE 8 ignores `box-sizing: border-box` if min/max-width/height is used."
    },
    {
      "description":"Chrome has problems selecting options from the `select` element when using `box-sizing: border-box` and browser zoom level is less than 100%."
    },
    {
      "description":"In IE8, the min-width property applies to `content-box` even if `box-sizing` is set to `border-box`."
    }
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"p",
      "6":"p",
      "7":"p",
      "8":"y",
      "9":"y",
      "10":"y",
      "11":"y"
    },
    "edge":{
      "12":"y",
      "13":"y",
      "14":"y"
    },
    "firefox":{
      "2":"y x",
      "3":"y x",
      "3.5":"y x",
      "3.6":"y x",
      "4":"y x",
      "5":"y x",
      "6":"y x",
      "7":"y x",
      "8":"y x",
      "9":"y x",
      "10":"y x",
      "11":"y x",
      "12":"y x",
      "13":"y x",
      "14":"y x",
      "15":"y x",
      "16":"y x",
      "17":"y x",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y x",
      "27":"y x",
      "28":"y x",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y"
    },
    "chrome":{
      "4":"y x",
      "5":"y x",
      "6":"y x",
      "7":"y x",
      "8":"y x",
      "9":"y x",
      "10":"y",
      "11":"y",
      "12":"y",
      "13":"y",
      "14":"y",
      "15":"y",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y",
      "51":"y",
      "52":"y",
      "53":"y",
      "54":"y"
    },
    "safari":{
      "3.1":"y x",
      "3.2":"y x",
      "4":"y x",
      "5":"y x",
      "5.1":"y",
      "6":"y",
      "6.1":"y",
      "7":"y",
      "7.1":"y",
      "8":"y",
      "9":"y",
      "9.1":"y",
      "10":"y",
      "TP":"y"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"y",
      "10.0-10.1":"y",
      "10.5":"y",
      "10.6":"y",
      "11":"y",
      "11.1":"y",
      "11.5":"y",
      "11.6":"y",
      "12":"y",
      "12.1":"y",
      "15":"y",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y"
    },
    "ios_saf":{
      "3.2":"y x",
      "4.0-4.1":"y x",
      "4.2-4.3":"y x",
      "5.0-5.1":"y",
      "6.0-6.1":"y",
      "7.0-7.1":"y",
      "8":"y",
      "8.1-8.4":"y",
      "9.0-9.2":"y",
      "9.3":"y"
    },
    "op_mini":{
      "all":"y"
    },
    "android":{
      "2.1":"y x",
      "2.2":"y x",
      "2.3":"y x",
      "3":"y x",
      "4":"y",
      "4.1":"y",
      "4.2-4.3":"y",
      "4.4":"y",
      "4.4.3-4.4.4":"y",
      "50":"y"
    },
    "bb":{
      "7":"y x",
      "10":"y"
    },
    "op_mob":{
      "10":"y",
      "11":"y",
      "11.1":"y",
      "11.5":"y",
      "12":"y",
      "12.1":"y",
      "37":"y"
    },
    "and_chr":{
      "51":"y"
    },
    "and_ff":{
      "46":"y"
    },
    "ie_mob":{
      "10":"y",
      "11":"y"
    },
    "and_uc":{
      "9.9":"y"
    },
    "samsung":{
      "4":"y"
    }
  },
  "notes":"Firefox currently also supports the `padding-box` in addition to `content-box` and `border-box`, though this value has been removed from the specification.",
  "notes_by_num":{
    
  },
  "usage_perc_y":97.95,
  "usage_perc_a":0,
  "ucprefix":false,
  "parent":"",
  "keywords":"border-box,content-box",
  "ie_id":"",
  "chrome_id":"",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],83:[function(require,module,exports){
module.exports={
  "title":"CSS3 Cursors: zoom-in & zoom-out",
  "description":"Support for `zoom-in`, `zoom-out` values for the CSS3 `cursor` property.",
  "spec":"http://www.w3.org/TR/css3-ui/#cursor",
  "status":"cr",
  "links":[
    {
      "url":"https://developer.mozilla.org/en-US/docs/Web/CSS/cursor",
      "title":"MDN Documentation"
    }
  ],
  "bugs":[
    
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n"
    },
    "edge":{
      "12":"y",
      "13":"y",
      "14":"y"
    },
    "firefox":{
      "2":"y x",
      "3":"y x",
      "3.5":"y x",
      "3.6":"y x",
      "4":"y x",
      "5":"y x",
      "6":"y x",
      "7":"y x",
      "8":"y x",
      "9":"y x",
      "10":"y x",
      "11":"y x",
      "12":"y x",
      "13":"y x",
      "14":"y x",
      "15":"y x",
      "16":"y x",
      "17":"y x",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y"
    },
    "chrome":{
      "4":"y x",
      "5":"y x",
      "6":"y x",
      "7":"y x",
      "8":"y x",
      "9":"y x",
      "10":"y x",
      "11":"y x",
      "12":"y x",
      "13":"y x",
      "14":"y x",
      "15":"y x",
      "16":"y x",
      "17":"y x",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y x",
      "27":"y x",
      "28":"y x",
      "29":"y x",
      "30":"y x",
      "31":"y x",
      "32":"y x",
      "33":"y x",
      "34":"y x",
      "35":"y x",
      "36":"y x",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y",
      "51":"y",
      "52":"y",
      "53":"y",
      "54":"y"
    },
    "safari":{
      "3.1":"y x",
      "3.2":"y x",
      "4":"y x",
      "5":"y x",
      "5.1":"y x",
      "6":"y x",
      "6.1":"y x",
      "7":"y x",
      "7.1":"y x",
      "8":"y x",
      "9":"y",
      "9.1":"y",
      "10":"y",
      "TP":"y"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"y",
      "12":"y",
      "12.1":"y",
      "15":"y x",
      "16":"y x",
      "17":"y x",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y"
    },
    "ios_saf":{
      "3.2":"n",
      "4.0-4.1":"n",
      "4.2-4.3":"n",
      "5.0-5.1":"n",
      "6.0-6.1":"n",
      "7.0-7.1":"n",
      "8":"n",
      "8.1-8.4":"n",
      "9.0-9.2":"n",
      "9.3":"n"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"n",
      "2.2":"n",
      "2.3":"n",
      "3":"n",
      "4":"n",
      "4.1":"n",
      "4.2-4.3":"n",
      "4.4":"n",
      "4.4.3-4.4.4":"n",
      "50":"n"
    },
    "bb":{
      "7":"y x",
      "10":"y x"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "12":"n",
      "12.1":"n",
      "37":"n"
    },
    "and_chr":{
      "51":"n"
    },
    "and_ff":{
      "46":"n"
    },
    "ie_mob":{
      "10":"n",
      "11":"n"
    },
    "and_uc":{
      "9.9":"n"
    },
    "samsung":{
      "4":"n"
    }
  },
  "notes":"",
  "notes_by_num":{
    
  },
  "usage_perc_y":44.14,
  "usage_perc_a":0,
  "ucprefix":false,
  "parent":"",
  "keywords":"cursors, pointers",
  "ie_id":"",
  "chrome_id":"",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],84:[function(require,module,exports){
module.exports={
  "title":"CSS3 tab-size",
  "description":"Method of customizing the width of the tab character. Only effective using 'white-space: pre' or 'white-space: pre-wrap'.",
  "spec":"http://www.w3.org/TR/css3-text/#tab-size",
  "status":"wd",
  "links":[
    {
      "url":"https://developer.mozilla.org/en-US/docs/Web/CSS/tab-size",
      "title":"MDN article"
    },
    {
      "url":"https://wpdev.uservoice.com/forums/257854-microsoft-edge-developer/suggestions/6524689-tab-size-property",
      "title":"Microsoft Edge feature request on UserVoice"
    }
  ],
  "bugs":[
    {
      "description":"Firefox [does not yet](https://bugzilla.mozilla.org/show_bug.cgi?id=943918) support `<length>` values"
    }
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n"
    },
    "edge":{
      "12":"n",
      "13":"n",
      "14":"u"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"n",
      "4":"a x #1",
      "5":"a x #1",
      "6":"a x #1",
      "7":"a x #1",
      "8":"a x #1",
      "9":"a x #1",
      "10":"a x #1",
      "11":"a x #1",
      "12":"a x #1",
      "13":"a x #1",
      "14":"a x #1",
      "15":"a x #1",
      "16":"a x #1",
      "17":"a x #1",
      "18":"a x #1",
      "19":"a x #1",
      "20":"a x #1",
      "21":"a x #1",
      "22":"a x #1",
      "23":"a x #1",
      "24":"a x #1",
      "25":"a x #1",
      "26":"a x #1",
      "27":"a x #1",
      "28":"a x #1",
      "29":"a x #1",
      "30":"a x #1",
      "31":"a x #1",
      "32":"a x #1",
      "33":"a x #1",
      "34":"a x #1",
      "35":"a x #1",
      "36":"a x #1",
      "37":"a x #1",
      "38":"a x #1",
      "39":"a x #1",
      "40":"a x #1",
      "41":"a x #1",
      "42":"a x #1",
      "43":"a x #1",
      "44":"a x #1",
      "45":"a x #1",
      "46":"a x #1",
      "47":"a x #1",
      "48":"a x #1",
      "49":"a x #1",
      "50":"a x #1"
    },
    "chrome":{
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"a #1",
      "22":"a #1",
      "23":"a #1",
      "24":"a #1",
      "25":"a #1",
      "26":"a #1",
      "27":"a #1",
      "28":"a #1",
      "29":"a #1",
      "30":"a #1",
      "31":"a #1",
      "32":"a #1",
      "33":"a #1",
      "34":"a #1",
      "35":"a #1",
      "36":"a #1",
      "37":"a #1",
      "38":"a #1",
      "39":"a #1",
      "40":"a #1",
      "41":"a #1",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y",
      "51":"y",
      "52":"y",
      "53":"y",
      "54":"y"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"n",
      "5":"n",
      "5.1":"n",
      "6":"n",
      "6.1":"a #1",
      "7":"a #1",
      "7.1":"a #1",
      "8":"a #1",
      "9":"a #1",
      "9.1":"a #1",
      "10":"a #1",
      "TP":"a #1"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"a x #1",
      "11":"a x #1",
      "11.1":"a x #1",
      "11.5":"a x #1",
      "11.6":"a x #1",
      "12":"a x #1",
      "12.1":"a x #1",
      "15":"a #1",
      "16":"a #1",
      "17":"a #1",
      "18":"a #1",
      "19":"a #1",
      "20":"a #1",
      "21":"a #1",
      "22":"a #1",
      "23":"a #1",
      "24":"a #1",
      "25":"a #1",
      "26":"a #1",
      "27":"a #1",
      "28":"a #1",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y"
    },
    "ios_saf":{
      "3.2":"n",
      "4.0-4.1":"n",
      "4.2-4.3":"n",
      "5.0-5.1":"n",
      "6.0-6.1":"n",
      "7.0-7.1":"a #1",
      "8":"a #1",
      "8.1-8.4":"a #1",
      "9.0-9.2":"a #1",
      "9.3":"a #1"
    },
    "op_mini":{
      "all":"a x #1"
    },
    "android":{
      "2.1":"n",
      "2.2":"n",
      "2.3":"n",
      "3":"n",
      "4":"n",
      "4.1":"n",
      "4.2-4.3":"n",
      "4.4":"a #1",
      "4.4.3-4.4.4":"a #1",
      "50":"a #1"
    },
    "bb":{
      "7":"a #1",
      "10":"a #1"
    },
    "op_mob":{
      "10":"n",
      "11":"a x #1",
      "11.1":"a x #1",
      "11.5":"a x #1",
      "12":"a x #1",
      "12.1":"a x #1",
      "37":"y"
    },
    "and_chr":{
      "51":"y"
    },
    "and_ff":{
      "46":"a x #1"
    },
    "ie_mob":{
      "10":"n",
      "11":"n"
    },
    "and_uc":{
      "9.9":"n"
    },
    "samsung":{
      "4":"y"
    }
  },
  "notes":"",
  "notes_by_num":{
    "1":"Partial refers to supporting `<integer>` but not `<length>` values."
  },
  "usage_perc_y":52.12,
  "usage_perc_a":29.09,
  "ucprefix":false,
  "parent":"",
  "keywords":"tab-size,tab-width",
  "ie_id":"csstabsizeproperty",
  "chrome_id":"",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],85:[function(require,module,exports){
module.exports={
  "title":"Flexible Box Layout Module",
  "description":"Method of positioning elements in horizontal or vertical stacks. Support includes the support for the all properties prefixed with `flex` as well as `display: flex`, `display: inline-flex`, `align-content`, `align-items`, `align-self`, `justify-content` and `order`.",
  "spec":"http://www.w3.org/TR/css3-flexbox/",
  "status":"cr",
  "links":[
    {
      "url":"http://bennettfeely.com/flexplorer/",
      "title":"Flexbox CSS generator"
    },
    {
      "url":"http://www.adobe.com/devnet/html5/articles/working-with-flexbox-the-new-spec.html",
      "title":"Article on using the latest spec"
    },
    {
      "url":"https://dev.opera.com/articles/view/advanced-cross-browser-flexbox/",
      "title":"Tutorial on cross-browser support"
    },
    {
      "url":"http://philipwalton.github.io/solved-by-flexbox/",
      "title":"Examples on how to solve common layout problems with flexbox"
    },
    {
      "url":"http://css-tricks.com/snippets/css/a-guide-to-flexbox/",
      "title":"A Complete Guide to Flexbox"
    },
    {
      "url":"http://the-echoplex.net/flexyboxes/",
      "title":"Flexbox playground and code generator"
    },
    {
      "url":"https://github.com/philipwalton/flexbugs",
      "title":"Flexbugs: Repo for flexbox bugs"
    },
    {
      "url":"https://github.com/10up/flexibility/",
      "title":"10up Open Sources IE 8 and 9 Support for Flexbox"
    },
    {
      "url":"https://github.com/vadimyer/ecligrid",
      "title":"Ecligrid - Mobile first flexbox grid system"
    }
  ],
  "bugs":[
    {
      "description":"In IE10 the default value for `flex` is `0 0 auto` rather than `1 0 auto` as defined in the latest spec."
    },
    {
      "description":"In Safari, the height of (non flex) children are not recognized in percentages. However other browsers recognize and scale the children based on percentage heights. ([See bug](https://bugs.webkit.org/show_bug.cgi?id=137730)) The bug also appeared in Chrome but was fixed in [Chrome 51](http://crbug.com/341310)"
    },
    {
      "description":"Firefox does not support [Flexbox in button elements](https://bugzilla.mozilla.org/show_bug.cgi?id=984869#c2)"
    },
    {
      "description":"[Flexbugs](https://github.com/philipwalton/flexbugs): community-curated list of flexbox issues and cross-browser workarounds for them"
    },
    {
      "description":"In IE 10, setting `-ms-flex-flow: row wrap` will not wrap unless `display: inline-block` is set on child elements."
    },
    {
      "description":"IE 11 does not vertically align items correctly when `min-height` is used [see bug](https://connect.microsoft.com/IE/feedback/details/816293/ie11-flexbox-with-min-height-not-vertically-aligning-with-align-items-center)"
    },
    {
      "description":"In IE10 and IE11, containers with `display: flex` and `flex-direction: column` will not properly calculate their flexed childrens' sizes if the container has `min-height` but no explicit `height` property. [See bug](https://connect.microsoft.com/IE/feedback/details/802625/min-height-and-flexbox-flex-direction-column-dont-work-together-in-ie-10-11-preview)."
    },
    {
      "description":"IE 11 requires a unit to be added to the third argument, the flex-basis property [see MSFT documentation](https://msdn.microsoft.com/en-us/library/dn254946%28v=vs.85%29.aspx)"
    },
    {
      "description":"Safari uses min/max width/height declarations for actually rendering the size of flex items, but it ignores those values when calculating how many items should be on a single line of a multi-line flex container. Instead, it simply uses the item's flex-basis value, or its width if the flex basis is set to auto. [see bug](https://bugs.webkit.org/show_bug.cgi?id=136041)"
    }
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"a x #2 #4",
      "11":"a #4"
    },
    "edge":{
      "12":"y",
      "13":"y",
      "14":"y"
    },
    "firefox":{
      "2":"a x #1",
      "3":"a x #1",
      "3.5":"a x #1",
      "3.6":"a x #1",
      "4":"a x #1",
      "5":"a x #1",
      "6":"a x #1",
      "7":"a x #1",
      "8":"a x #1",
      "9":"a x #1",
      "10":"a x #1",
      "11":"a x #1",
      "12":"a x #1",
      "13":"a x #1",
      "14":"a x #1",
      "15":"a x #1",
      "16":"a x #1",
      "17":"a x #1",
      "18":"a x #1",
      "19":"a x #1",
      "20":"a x #1",
      "21":"a x #1",
      "22":"a #3",
      "23":"a #3",
      "24":"a #3",
      "25":"a #3",
      "26":"a #3",
      "27":"a #3",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y"
    },
    "chrome":{
      "4":"a x #1",
      "5":"a x #1",
      "6":"a x #1",
      "7":"a x #1",
      "8":"a x #1",
      "9":"a x #1",
      "10":"a x #1",
      "11":"a x #1",
      "12":"a x #1",
      "13":"a x #1",
      "14":"a x #1",
      "15":"a x #1",
      "16":"a x #1",
      "17":"a x #1",
      "18":"a x #1",
      "19":"a x #1",
      "20":"a x #1",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y x",
      "27":"y x",
      "28":"y x",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y",
      "51":"y",
      "52":"y",
      "53":"y",
      "54":"y"
    },
    "safari":{
      "3.1":"a x #1",
      "3.2":"a x #1",
      "4":"a x #1",
      "5":"a x #1",
      "5.1":"a x #1",
      "6":"a x #1",
      "6.1":"y x",
      "7":"y x",
      "7.1":"y x",
      "8":"y x",
      "9":"y",
      "9.1":"y",
      "10":"y",
      "TP":"y"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"n",
      "12":"n",
      "12.1":"y",
      "15":"y x",
      "16":"y x",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y"
    },
    "ios_saf":{
      "3.2":"a x #1",
      "4.0-4.1":"a x #1",
      "4.2-4.3":"a x #1",
      "5.0-5.1":"a x #1",
      "6.0-6.1":"a x #1",
      "7.0-7.1":"y x",
      "8":"y x",
      "8.1-8.4":"y x",
      "9.0-9.2":"y",
      "9.3":"y"
    },
    "op_mini":{
      "all":"y"
    },
    "android":{
      "2.1":"a x #1",
      "2.2":"a x #1",
      "2.3":"a x #1",
      "3":"a x #1",
      "4":"a x #1",
      "4.1":"a x #1",
      "4.2-4.3":"a x #1",
      "4.4":"y",
      "4.4.3-4.4.4":"y",
      "50":"y"
    },
    "bb":{
      "7":"a x #1",
      "10":"y"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "12":"n",
      "12.1":"y",
      "37":"y"
    },
    "and_chr":{
      "51":"y"
    },
    "and_ff":{
      "46":"y"
    },
    "ie_mob":{
      "10":"a x #2",
      "11":"y"
    },
    "and_uc":{
      "9.9":"a x #1"
    },
    "samsung":{
      "4":"y"
    }
  },
  "notes":"Most partial support refers to supporting an [older version](http://www.w3.org/TR/2009/WD-css3-flexbox-20090723/) of the specification or an [older syntax](http://www.w3.org/TR/2012/WD-css3-flexbox-20120322/).",
  "notes_by_num":{
    "1":"Only supports the [old flexbox](http://www.w3.org/TR/2009/WD-css3-flexbox-20090723) specification and does not support wrapping.",
    "2":"Only supports the [2012 syntax](http://www.w3.org/TR/2012/WD-css3-flexbox-20120322/)",
    "3":"Does not support flex-wrap or flex-flow properties",
    "4":"Partial support is due to large amount of bugs present (see known issues)"
  },
  "usage_perc_y":82.65,
  "usage_perc_a":14.17,
  "ucprefix":false,
  "parent":"",
  "keywords":"flex-box,flex-direction,flex-wrap,flex-flow,flex-grow,flex-basis,display:flex,flex box",
  "ie_id":"flexbox",
  "chrome_id":"4837301406400512",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],86:[function(require,module,exports){
module.exports={
  "title":"CSS font-feature-settings",
  "description":"Method of applying advanced typographic and language-specific font features to supported OpenType fonts.",
  "spec":"http://w3.org/TR/css3-fonts/#font-rend-props",
  "status":"cr",
  "links":[
    {
      "url":"http://ie.microsoft.com/testdrive/Graphics/opentype/",
      "title":"Demo pages (IE/Firefox only)"
    },
    {
      "url":"http://hacks.mozilla.org/2010/11/firefox-4-font-feature-support/",
      "title":"Mozilla hacks article"
    },
    {
      "url":"http://html5accessibility.com/",
      "title":"Detailed tables on accessability support"
    },
    {
      "url":"http://docs.webplatform.org/wiki/css/properties/font-feature-settings",
      "title":"WebPlatform Docs"
    },
    {
      "url":"https://developer.mozilla.org/en-US/docs/Web/CSS/font-feature-settings",
      "title":"Mozilla Developer Network"
    },
    {
      "url":"https://www.microsoft.com/typography/otspec/featuretags.htm",
      "title":"OpenType layout feature tag registry"
    },
    {
      "url":"http://help.typekit.com/customer/portal/articles/1789736-syntax-for-opentype-features-in-css#salt",
      "title":"Syntax for OpenType features in CSS (Adobe Typekit Help)"
    }
  ],
  "bugs":[
    {
      "description":"IE10 and 11 do not always appear to support the `ss01` value correctly."
    },
    {
      "description":"IE10 and 11 on Windows 7 [can hide the text](http://stackoverflow.com/questions/22151835/msie-10-web-font-and-font-feature-settings-causes-invisible-text) under certain circumstances."
    }
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"y",
      "11":"y"
    },
    "edge":{
      "12":"y",
      "13":"y",
      "14":"y"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"n",
      "4":"a x #1",
      "5":"a x #1",
      "6":"a x #1",
      "7":"a x #1",
      "8":"a x #1",
      "9":"a x #1",
      "10":"a x #1",
      "11":"a x #1",
      "12":"a x #1",
      "13":"a x #1",
      "14":"a x #1",
      "15":"y x",
      "16":"y x",
      "17":"y x",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y x",
      "27":"y x",
      "28":"y x",
      "29":"y x",
      "30":"y x",
      "31":"y x",
      "32":"y x",
      "33":"y x",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y"
    },
    "chrome":{
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"a x #2",
      "17":"a x #2",
      "18":"a x #2",
      "19":"a x #2",
      "20":"a x #2",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y x",
      "27":"y x",
      "28":"y x",
      "29":"y x",
      "30":"y x",
      "31":"y x",
      "32":"y x",
      "33":"y x",
      "34":"y x",
      "35":"y x",
      "36":"y x",
      "37":"y x",
      "38":"y x",
      "39":"y x",
      "40":"y x",
      "41":"y x",
      "42":"y x",
      "43":"y x",
      "44":"y x",
      "45":"y x",
      "46":"y x",
      "47":"y x",
      "48":"y",
      "49":"y",
      "50":"y",
      "51":"y",
      "52":"y",
      "53":"y",
      "54":"y"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"a",
      "5":"a",
      "5.1":"a",
      "6":"a",
      "6.1":"n",
      "7":"n",
      "7.1":"n",
      "8":"n",
      "9":"n",
      "9.1":"y",
      "10":"y",
      "TP":"y"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"n",
      "12":"n",
      "12.1":"n",
      "15":"y x",
      "16":"y x",
      "17":"y x",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y x",
      "27":"y x",
      "28":"y x",
      "29":"y x",
      "30":"y x",
      "31":"y x",
      "32":"y x",
      "33":"y x",
      "34":"y x",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y"
    },
    "ios_saf":{
      "3.2":"a",
      "4.0-4.1":"a",
      "4.2-4.3":"a",
      "5.0-5.1":"a",
      "6.0-6.1":"a",
      "7.0-7.1":"n",
      "8":"n",
      "8.1-8.4":"n",
      "9.0-9.2":"n",
      "9.3":"y"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"n",
      "2.2":"n",
      "2.3":"n",
      "3":"n",
      "4":"n",
      "4.1":"n",
      "4.2-4.3":"n",
      "4.4":"y x",
      "4.4.3-4.4.4":"y x",
      "50":"y"
    },
    "bb":{
      "7":"n",
      "10":"y x"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "12":"n",
      "12.1":"n",
      "37":"y"
    },
    "and_chr":{
      "51":"y"
    },
    "and_ff":{
      "46":"y"
    },
    "ie_mob":{
      "10":"n",
      "11":"n"
    },
    "and_uc":{
      "9.9":"y x"
    },
    "samsung":{
      "4":"y x"
    }
  },
  "notes":"Whenever possible, font-variant shorthand property or an associated longhand property, font-variant-ligatures, font-variant-caps, font-variant-east-asian, font-variant-alternates, font-variant-numeric or font-variant-position should be used. This property is a low-level feature designed to handle special cases where no other way to enable or access an OpenType font feature exists. In particular, this CSS property shouldn't be used to enable small caps.",
  "notes_by_num":{
    "1":"From Gecko 2.0 (Firefox 4.0) to Gecko 14.0 (Firefox 14.0) included, Gecko supported an older syntax, slightly different from the modern one: http://hacks.mozilla.org/2010/11/firefox-4-font-feature-support/",
    "2":"Partial support in older Chrome versions refers to lacking support in Mac OS X."
  },
  "usage_perc_y":87.12,
  "usage_perc_a":0.41,
  "ucprefix":false,
  "parent":"",
  "keywords":"font-feature,font-feature-settings,kern,kerning,font-variant-alternates,ligatures,font-variant-ligatures",
  "ie_id":"",
  "chrome_id":"",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],87:[function(require,module,exports){
module.exports={
  "title":"Full Screen API",
  "description":"API for allowing content (like a video or canvas element) to take up the entire screen.",
  "spec":"https://fullscreen.spec.whatwg.org/",
  "status":"ls",
  "links":[
    {
      "url":"https://developer.mozilla.org/en/DOM/Using_full-screen_mode",
      "title":"MDN article"
    },
    {
      "url":"http://jlongster.com/2011/11/21/canvas.html",
      "title":"Blog post"
    },
    {
      "url":"http://hacks.mozilla.org/2012/01/using-the-fullscreen-api-in-web-browsers/",
      "title":"Mozilla hacks article"
    },
    {
      "url":"http://docs.webplatform.org/wiki/dom/Element/requestFullscreen",
      "title":"WebPlatform Docs"
    }
  ],
  "bugs":[
    {
      "description":"IE 11 doesn't allow going to fullscreen mode when the event that triggers `msRequestFullscreen()` is a `keydown` or `pointerdown` event (`keypress` and `click` do work)"
    },
    {
      "description":"Safari blocks access to keyboard events in fullscreen mode (as a security measure)."
    },
    {
      "description":"Safari doesn't support stacking, meaning only one element can be set to full screen. `webkitRequestFullScreen()` is ignored for other elements and no error event is dispatched."
    },
    {
      "description":"IE 11 does not allow scrolling when document.documentElement is set to full screen."
    },
    {
      "description":"IE 11 does not properly support fullscreen when opening from an iframe."
    },
    {
      "description":"Opera 12.1 uses the older specificaton's `:fullscreen-ancestor` pseudo-class instead of the  the `::backdrop` pseudo-element."
    }
  ],
  "categories":[
    "JS API"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"a x #3"
    },
    "edge":{
      "12":"a #3",
      "13":"a #3",
      "14":"a #3"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"n",
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"a x #1 #3",
      "11":"a x #1 #3",
      "12":"a x #1 #3",
      "13":"a x #1 #3",
      "14":"a x #1 #3",
      "15":"a x #1 #3",
      "16":"a x #1 #3",
      "17":"a x #1 #3",
      "18":"a x #1 #3",
      "19":"a x #1 #3",
      "20":"a x #1 #3",
      "21":"a x #1 #3",
      "22":"a x #1 #3",
      "23":"a x #1 #3",
      "24":"a x #1 #3",
      "25":"a x #1 #3",
      "26":"a x #1 #3",
      "27":"a x #1 #3",
      "28":"a x #1 #3",
      "29":"a x #1 #3",
      "30":"a x #1 #3",
      "31":"a x #1 #3",
      "32":"a x #1 #3",
      "33":"a x #1 #3",
      "34":"a x #1 #3",
      "35":"a x #1 #3",
      "36":"a x #1 #3",
      "37":"a x #1 #3",
      "38":"a x #1 #3",
      "39":"a x #1 #3",
      "40":"a x #1 #3",
      "41":"a x #1 #3",
      "42":"a x #1 #3",
      "43":"a x #1 #3",
      "44":"a x #1 #3",
      "45":"a x #1 #3",
      "46":"a x #1 #3",
      "47":"a x #1 #3 #4",
      "48":"a x #1 #3 #4",
      "49":"a x #1 #3 #4",
      "50":"a x #1 #3 #4"
    },
    "chrome":{
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"a x #1 #3",
      "16":"a x #1 #3",
      "17":"a x #1 #3",
      "18":"a x #1 #3",
      "19":"a x #1 #3",
      "20":"a x #2 #3",
      "21":"a x #2 #3",
      "22":"a x #2 #3",
      "23":"a x #2 #3",
      "24":"a x #2 #3",
      "25":"a x #2 #3",
      "26":"a x #2 #3",
      "27":"a x #2 #3",
      "28":"a x #2 #3",
      "29":"a x #2 #3",
      "30":"a x #2 #3",
      "31":"a x #2 #3",
      "32":"a x #2 #3",
      "33":"a x #2 #3",
      "34":"a x #2 #3",
      "35":"a x #2 #3",
      "36":"a x #2 #3",
      "37":"a x #2 #3",
      "38":"a x #2 #3",
      "39":"a x #2 #3",
      "40":"a x #2 #3",
      "41":"a x #2 #3",
      "42":"a x #2 #3",
      "43":"a x #2 #3",
      "44":"a x #2 #3",
      "45":"a x #2 #3",
      "46":"a x #2 #3",
      "47":"a x #2 #3",
      "48":"a x #2 #3",
      "49":"a x #2 #3",
      "50":"a x #2 #3",
      "51":"a x #2 #3",
      "52":"a x #2 #3",
      "53":"a x #2 #3",
      "54":"a x #2 #3"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"n",
      "5":"n",
      "5.1":"a x #1 #3",
      "6":"a x #2 #3",
      "6.1":"a x #2 #3",
      "7":"a x #2 #3",
      "7.1":"a x #2 #3",
      "8":"a x #2 #3",
      "9":"a x #2 #3",
      "9.1":"a x #2 #3",
      "10":"a x #2 #3",
      "TP":"a x #2 #3"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"n",
      "12":"n",
      "12.1":"y",
      "15":"a x #2 #3",
      "16":"a x #2 #3",
      "17":"a x #2 #3",
      "18":"a x #2 #3",
      "19":"a x #2 #3",
      "20":"a x #2 #3",
      "21":"a x #2 #3",
      "22":"a x #2 #3",
      "23":"a x #2 #3",
      "24":"a x #2 #3",
      "25":"a x #2 #3",
      "26":"a x #2 #3",
      "27":"a x #2 #3",
      "28":"a x #2 #3",
      "29":"a x #2 #3",
      "30":"a x #2 #3",
      "31":"a x #2 #3",
      "32":"a x #2 #3",
      "33":"a x #2 #3",
      "34":"a x #2 #3",
      "35":"a x #2 #3",
      "36":"a x #2 #3",
      "37":"a x #2 #3",
      "38":"a x #2 #3",
      "39":"a x #2 #3",
      "40":"a x #2 #3"
    },
    "ios_saf":{
      "3.2":"n",
      "4.0-4.1":"n",
      "4.2-4.3":"n",
      "5.0-5.1":"n",
      "6.0-6.1":"n",
      "7.0-7.1":"n",
      "8":"n",
      "8.1-8.4":"n",
      "9.0-9.2":"n",
      "9.3":"n"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"n",
      "2.2":"n",
      "2.3":"n",
      "3":"n",
      "4":"n",
      "4.1":"n",
      "4.2-4.3":"n",
      "4.4":"n",
      "4.4.3-4.4.4":"n",
      "50":"n"
    },
    "bb":{
      "7":"n",
      "10":"a x #2"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "12":"n",
      "12.1":"n",
      "37":"a x #2 #3"
    },
    "and_chr":{
      "51":"a x #2 #3"
    },
    "and_ff":{
      "46":"a x #1 #3"
    },
    "ie_mob":{
      "10":"n",
      "11":"a x #3"
    },
    "and_uc":{
      "9.9":"n"
    },
    "samsung":{
      "4":"a x #2 #3"
    }
  },
  "notes":"",
  "notes_by_num":{
    "1":"Partial support refers to supporting an earlier draft of the spec.",
    "2":"Partial support refers to not supporting `::backdrop`, and supporting the old `:full-screen` syntax rather than the standard `:fullscreen`.",
    "3":"Partial support refers to not returning a Promise, as specified in the latest version of the spec.",
    "4":"Unprefixed support is available behind the `full-screen-api.unprefix.enabled` flag"
  },
  "usage_perc_y":0.11,
  "usage_perc_a":71.8,
  "ucprefix":false,
  "parent":"",
  "keywords":"full-screen",
  "ie_id":"fullscreenapi",
  "chrome_id":"5259513871466496",
  "firefox_id":"fullscreen",
  "webkit_id":"",
  "shown":true
}

},{}],88:[function(require,module,exports){
module.exports={
  "title":"Intrinsic & Extrinsic Sizing",
  "description":"Allows for the heights and widths to be specified in intrinsic values using the `fill`, `max-content`, `min-content`, and `fit-content` properties.",
  "spec":"http://www.w3.org/TR/css3-sizing/",
  "status":"wd",
  "links":[
    {
      "url":"http://demosthenes.info/blog/662/Design-From-the-Inside-Out-With-CSS-MinContent",
      "title":"Min-Content tutorial"
    }
  ],
  "bugs":[
    
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n"
    },
    "edge":{
      "12":"n",
      "13":"n",
      "14":"u"
    },
    "firefox":{
      "2":"n",
      "3":"a x #1 #2 #3",
      "3.5":"a x #1 #2 #3",
      "3.6":"a x #1 #2 #3",
      "4":"a x #1 #2 #3",
      "5":"a x #1 #2 #3",
      "6":"a x #1 #2 #3",
      "7":"a x #1 #2 #3",
      "8":"a x #1 #2 #3",
      "9":"a x #1 #2 #3",
      "10":"a x #1 #2 #3",
      "11":"a x #1 #2 #3",
      "12":"a x #1 #2 #3",
      "13":"a x #1 #2 #3",
      "14":"a x #1 #2 #3",
      "15":"a x #1 #2 #3",
      "16":"a x #1 #2 #3",
      "17":"a x #1 #2 #3",
      "18":"a x #1 #2 #3",
      "19":"a x #1 #2 #3",
      "20":"a x #1 #2 #3",
      "21":"a x #1 #2 #3",
      "22":"a x #1 #2 #3",
      "23":"a x #1 #2 #3",
      "24":"a x #1 #2 #3",
      "25":"a x #1 #2 #3",
      "26":"a x #1 #2 #3",
      "27":"a x #1 #2 #3",
      "28":"a x #1 #2 #3",
      "29":"a x #1 #2 #3",
      "30":"a x #1 #2 #3",
      "31":"a x #1 #2 #3",
      "32":"a x #1 #2 #3",
      "33":"a x #1 #2 #3",
      "34":"a x #1 #2 #3",
      "35":"a x #1 #2 #3",
      "36":"a x #1 #2 #3",
      "37":"a x #1 #2 #3",
      "38":"a x #1 #2 #3",
      "39":"a x #1 #2 #3",
      "40":"a x #1 #2 #3",
      "41":"a x #1 #2 #3",
      "42":"a x #1 #2 #3",
      "43":"a x #1 #2 #3",
      "44":"a x #1 #2 #3",
      "45":"a x #1 #2 #3",
      "46":"a x #1 #2 #3",
      "47":"a x #1 #2 #3",
      "48":"a x #1 #2 #3",
      "49":"a x #1 #2 #3",
      "50":"a x #1 #2 #3"
    },
    "chrome":{
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"y x #3",
      "23":"y x #3",
      "24":"y x #3",
      "25":"y x #3",
      "26":"y x #3",
      "27":"y x #3",
      "28":"y x #3",
      "29":"y x #3",
      "30":"y x #3",
      "31":"y x #3",
      "32":"y x #3",
      "33":"y x #3",
      "34":"y x #3",
      "35":"y x #3",
      "36":"y x #3",
      "37":"y x #3",
      "38":"y x #3",
      "39":"y x #3",
      "40":"y x #3",
      "41":"y x #3",
      "42":"y x #3",
      "43":"y x #3",
      "44":"y x #3",
      "45":"y x #3",
      "46":"y #3 #4",
      "47":"y #3 #4",
      "48":"y #3 #4",
      "49":"y #3 #4",
      "50":"y #3 #4",
      "51":"y #3 #4",
      "52":"y #3 #4",
      "53":"y #3 #4",
      "54":"y #3 #4"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"n",
      "5":"n",
      "5.1":"n",
      "6":"n",
      "6.1":"a x #1 #3",
      "7":"a x #1 #3",
      "7.1":"a x #1 #3",
      "8":"a x #1 #3",
      "9":"a x #3",
      "9.1":"a x #3",
      "10":"a x #3",
      "TP":"a x #3"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"n",
      "12":"n",
      "12.1":"n",
      "15":"y x #3",
      "16":"y x #3",
      "17":"y x #3",
      "18":"y x #3",
      "19":"y x #3",
      "20":"y x #3",
      "21":"y x #3",
      "22":"y x #3",
      "23":"y x #3",
      "24":"y x #3",
      "25":"y x #3",
      "26":"y x #3",
      "27":"y x #3",
      "28":"y x #3",
      "29":"y x #3",
      "30":"y x #3",
      "31":"y x #3",
      "32":"y x #3",
      "33":"y #3 #4",
      "34":"y #3",
      "35":"y #3 #4",
      "36":"y #3 #4",
      "37":"y #3 #4",
      "38":"y #3 #4",
      "39":"y #3 #4",
      "40":"y #3 #4"
    },
    "ios_saf":{
      "3.2":"n",
      "4.0-4.1":"n",
      "4.2-4.3":"n",
      "5.0-5.1":"n",
      "6.0-6.1":"n",
      "7.0-7.1":"a x #1 #3",
      "8":"a x #1 #3",
      "8.1-8.4":"a x #1 #3",
      "9.0-9.2":"a x #3",
      "9.3":"a x #3"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"n",
      "2.2":"n",
      "2.3":"n",
      "3":"n",
      "4":"n",
      "4.1":"n",
      "4.2-4.3":"n",
      "4.4":"y x #3",
      "4.4.3-4.4.4":"y x #3",
      "50":"y #3 #4"
    },
    "bb":{
      "7":"n",
      "10":"y x #3"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "12":"n",
      "12.1":"n",
      "37":"y #3 #4"
    },
    "and_chr":{
      "51":"y #3 #4"
    },
    "and_ff":{
      "46":"a x #1 #2 #3"
    },
    "ie_mob":{
      "10":"n",
      "11":"n"
    },
    "and_uc":{
      "9.9":"n"
    },
    "samsung":{
      "4":"y x #3"
    }
  },
  "notes":"Prefixes are on the values, not the property names (e.g. -webkit-min-content)\r\n\r\nOlder webkit browsers also support the unofficial `intrinsic` value which acts the same as `max-content`.",
  "notes_by_num":{
    "1":"Does not support for height/min-height/max-height property, only width. [see test case](http://codepen.io/shshaw/pen/Kiwaz) [Firefox bug](https://bugzilla.mozilla.org/show_bug.cgi?id=567039)",
    "2":"Firefox currently supports the \"-moz-available\" property rather than \"-moz-fill\".",
    "3":"Does not support for \"flex-basis\" property. [see specs](http://www.w3.org/TR/2015/WD-css-flexbox-1-20150514/#flex-basis-property).\r\n[Blink bug](https://codereview.chromium.org/1304853002/),[Firefox bug](https://bugzilla.mozilla.org/show_bug.cgi?id=1055887)",
    "4":"This does not yet unprefix fill-available (aka fill)[See bug](https://chromium.googlesource.com/chromium/blink.git/+/bf119cdfece210e69c9a99af06f1b9981e2a1bc2), because the [CSSWG](https://lists.w3.org/Archives/Public/www-style/2015Aug/0127.html) is not ready for that yet."
  },
  "usage_perc_y":56.96,
  "usage_perc_a":19.37,
  "ucprefix":false,
  "parent":"",
  "keywords":"fill,fill-available,max-content,min-content,fit-content,contain-floats,intrinsic,extrinsic,sizing",
  "ie_id":"cssintrinsicsizing",
  "chrome_id":"5901353784180736",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],89:[function(require,module,exports){
module.exports={
  "title":"CSS3 Multiple column layout",
  "description":"Method of flowing information in multiple columns",
  "spec":"http://www.w3.org/TR/css3-multicol/",
  "status":"cr",
  "links":[
    {
      "url":"https://dev.opera.com/articles/view/css3-multi-column-layout/",
      "title":"Dev.Opera article"
    },
    {
      "url":"http://webdesign.tutsplus.com/tutorials/htmlcss-tutorials/an-introduction-to-the-css3-multiple-column-layout-module/",
      "title":"Introduction page"
    },
    {
      "url":"http://docs.webplatform.org/wiki/css/properties/column-width",
      "title":"WebPlatform Docs"
    },
    {
      "url":"https://github.com/hamsterbacke23/multicolumn-polyfill",
      "title":"Polyfill"
    }
  ],
  "bugs":[
    {
      "description":"In Firefox, the property `column-span` (or `-moz-column-span`) does not yet work. See [the bug](https://bugzilla.mozilla.org/show_bug.cgi?id=616436)."
    },
    {
      "description":"Chrome is reported to incorrectly calculate the container height, and often breaks on margins, padding, and can display 1px of the next column at the bottom of the previous column. Part of these issues can be solved by adding `-webkit-perspective:1;` to the column container. This creates a new stacking context for the container, and apparently causes chrome to (re)calculate column layout.\r\n"
    },
    {
      "description":"Browsers behave differently when flowing `ol` list numbers in columns: IE and Safari only show numbers for the first column. Chrome does not show any numbers. Only Firefox behaves as expected with numbers showing for all items."
    },
    {
      "description":"IE has been reported to incorrectly break on elements across columns when having more than 3 columns.\r\n"
    },
    {
      "description":"IE 10 has a bug where text-shadow doesn't work when used inside columns [see testcase](https://jsfiddle.net/0bwwrtda/)\r\n"
    },
    {
      "description":"Firefox does not split tables into columns"
    },
    {
      "description":"Firefox and Chrome do not support columns on the <fieldset> element [see bug](https://bugzilla.mozilla.org/show_bug.cgi?id=727164)"
    },
    {
      "description":"Safari 5-8 is known to render columns [less evenly](http://stackoverflow.com/questions/14148078/safari-column-count-differs-from-firefox-and-chrome) than other browsers"
    }
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"y",
      "11":"y"
    },
    "edge":{
      "12":"y",
      "13":"y",
      "14":"y"
    },
    "firefox":{
      "2":"a x",
      "3":"a x",
      "3.5":"a x",
      "3.6":"a x",
      "4":"a x",
      "5":"a x",
      "6":"a x",
      "7":"a x",
      "8":"a x",
      "9":"a x",
      "10":"a x",
      "11":"a x",
      "12":"a x",
      "13":"a x",
      "14":"a x",
      "15":"a x",
      "16":"a x",
      "17":"a x",
      "18":"a x",
      "19":"a x",
      "20":"a x",
      "21":"a x",
      "22":"a x",
      "23":"a x",
      "24":"a x",
      "25":"a x",
      "26":"a x",
      "27":"a x",
      "28":"a x",
      "29":"a x",
      "30":"a x",
      "31":"a x",
      "32":"a x",
      "33":"a x",
      "34":"a x",
      "35":"a x",
      "36":"a x",
      "37":"a x",
      "38":"a x",
      "39":"a x",
      "40":"a x",
      "41":"a x",
      "42":"a x",
      "43":"a x",
      "44":"a x",
      "45":"a x",
      "46":"a x",
      "47":"a x",
      "48":"a x",
      "49":"a x",
      "50":"a x"
    },
    "chrome":{
      "4":"a x",
      "5":"a x",
      "6":"a x",
      "7":"a x",
      "8":"a x",
      "9":"a x",
      "10":"a x",
      "11":"a x",
      "12":"a x",
      "13":"a x",
      "14":"a x",
      "15":"a x",
      "16":"a x",
      "17":"a x",
      "18":"a x",
      "19":"a x",
      "20":"a x",
      "21":"a x",
      "22":"a x",
      "23":"a x",
      "24":"a x",
      "25":"a x",
      "26":"a x",
      "27":"a x",
      "28":"a x",
      "29":"a x",
      "30":"a x",
      "31":"a x",
      "32":"a x",
      "33":"a x",
      "34":"a x",
      "35":"a x",
      "36":"a x",
      "37":"a x",
      "38":"a x",
      "39":"a x",
      "40":"a x",
      "41":"a x",
      "42":"a x",
      "43":"a x",
      "44":"a x",
      "45":"a x",
      "46":"a x",
      "47":"a x",
      "48":"a x",
      "49":"a x",
      "50":"a",
      "51":"a",
      "52":"a",
      "53":"a",
      "54":"a"
    },
    "safari":{
      "3.1":"a x",
      "3.2":"a x",
      "4":"a x",
      "5":"a x",
      "5.1":"a x",
      "6":"a x",
      "6.1":"a x",
      "7":"a x",
      "7.1":"a x",
      "8":"a x",
      "9":"a",
      "9.1":"a",
      "10":"a",
      "TP":"a"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"y",
      "11.5":"y",
      "11.6":"y",
      "12":"y",
      "12.1":"y",
      "15":"a x",
      "16":"a x",
      "17":"a x",
      "18":"a x",
      "19":"a x",
      "20":"a x",
      "21":"a x",
      "22":"a x",
      "23":"a x",
      "24":"a x",
      "25":"a x",
      "26":"a x",
      "27":"a x",
      "28":"a x",
      "29":"a x",
      "30":"a x",
      "31":"a x",
      "32":"a x",
      "33":"a x",
      "34":"a x",
      "35":"a x",
      "36":"a x",
      "37":"a",
      "38":"a",
      "39":"a",
      "40":"a"
    },
    "ios_saf":{
      "3.2":"a x",
      "4.0-4.1":"a x",
      "4.2-4.3":"a x",
      "5.0-5.1":"a x",
      "6.0-6.1":"a x",
      "7.0-7.1":"a x",
      "8":"a x",
      "8.1-8.4":"a x",
      "9.0-9.2":"a",
      "9.3":"a"
    },
    "op_mini":{
      "all":"y"
    },
    "android":{
      "2.1":"a x",
      "2.2":"a x",
      "2.3":"a x",
      "3":"a x",
      "4":"a x",
      "4.1":"a x",
      "4.2-4.3":"a x",
      "4.4":"a x",
      "4.4.3-4.4.4":"a x",
      "50":"a x"
    },
    "bb":{
      "7":"a x",
      "10":"a x"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"y",
      "11.5":"y",
      "12":"y",
      "12.1":"y",
      "37":"a x"
    },
    "and_chr":{
      "51":"a"
    },
    "and_ff":{
      "46":"a x"
    },
    "ie_mob":{
      "10":"y",
      "11":"y"
    },
    "and_uc":{
      "9.9":"a x"
    },
    "samsung":{
      "4":"a x"
    }
  },
  "notes":"Partial support refers to not supporting the `break-before`, `break-after`, `break-inside` properties. WebKit- and Blink-based browsers do have equivalent support for the non-standard `-webkit-column-break-*` properties to accomplish the same result (but only the `auto` and `always` values). Firefox does not support `break-*`.",
  "notes_by_num":{
    
  },
  "usage_perc_y":12.36,
  "usage_perc_a":84.49,
  "ucprefix":false,
  "parent":"",
  "keywords":"column-count,column-width,column-gap,column-rule,column-span,column-fill",
  "ie_id":"multicolumnfullsupport",
  "chrome_id":"6526151266664448,5630943616303104",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],90:[function(require,module,exports){
module.exports={
  "title":"CSS3 object-fit/object-position",
  "description":"Method of specifying how an object (image or video) should fit inside its box. object-fit options include \"contain\" (fit according to aspect ratio), \"fill\" (stretches object to fill) and \"cover\" (overflows box but maintains ratio), where object-position allows the object to be repositioned like background-image does.",
  "spec":"http://www.w3.org/TR/css3-images/",
  "status":"cr",
  "links":[
    {
      "url":"https://dev.opera.com/articles/view/css3-object-fit-object-position/",
      "title":"Dev.Opera article"
    },
    {
      "url":"http://docs.webplatform.org/wiki/css/properties/object-fit",
      "title":"WebPlatform Docs"
    },
    {
      "url":"https://github.com/bfred-it/object-fit-images/",
      "title":"object-fit-images Polyfill for IE & Edge"
    }
  ],
  "bugs":[
    
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n"
    },
    "edge":{
      "12":"n",
      "13":"n",
      "14":"n"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"n",
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"n",
      "25":"n",
      "26":"n",
      "27":"n",
      "28":"n",
      "29":"n",
      "30":"n",
      "31":"n",
      "32":"n",
      "33":"n",
      "34":"n",
      "35":"n",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y"
    },
    "chrome":{
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"n",
      "25":"n",
      "26":"n",
      "27":"n",
      "28":"n",
      "29":"n",
      "30":"n",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y",
      "51":"y",
      "52":"y",
      "53":"y",
      "54":"y"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"n",
      "5":"n",
      "5.1":"n",
      "6":"n",
      "6.1":"n",
      "7":"n",
      "7.1":"a #1",
      "8":"a #1",
      "9":"a #1",
      "9.1":"a #1",
      "10":"y",
      "TP":"y"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"y x",
      "11":"y x",
      "11.1":"y x",
      "11.5":"y x",
      "11.6":"y x",
      "12":"y x",
      "12.1":"y x",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y"
    },
    "ios_saf":{
      "3.2":"n",
      "4.0-4.1":"n",
      "4.2-4.3":"n",
      "5.0-5.1":"n",
      "6.0-6.1":"n",
      "7.0-7.1":"n",
      "8":"a #1",
      "8.1-8.4":"a #1",
      "9.0-9.2":"a #1",
      "9.3":"a #1"
    },
    "op_mini":{
      "all":"y x"
    },
    "android":{
      "2.1":"n",
      "2.2":"n",
      "2.3":"n",
      "3":"n",
      "4":"n",
      "4.1":"n",
      "4.2-4.3":"n",
      "4.4":"n",
      "4.4.3-4.4.4":"y",
      "50":"y"
    },
    "bb":{
      "7":"n",
      "10":"n"
    },
    "op_mob":{
      "10":"n",
      "11":"y x",
      "11.1":"y x",
      "11.5":"y x",
      "12":"y x",
      "12.1":"y x",
      "37":"y"
    },
    "and_chr":{
      "51":"y"
    },
    "and_ff":{
      "46":"y"
    },
    "ie_mob":{
      "10":"n",
      "11":"n"
    },
    "and_uc":{
      "9.9":"n"
    },
    "samsung":{
      "4":"y"
    }
  },
  "notes":"",
  "notes_by_num":{
    "1":"Partial support in Safari refers to support for `object-fit` but not `object-position`."
  },
  "usage_perc_y":66.3,
  "usage_perc_a":10.75,
  "ucprefix":false,
  "parent":"",
  "keywords":"objectfit,objectposition",
  "ie_id":"objectfitandobjectposition",
  "chrome_id":"5302669702856704",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],91:[function(require,module,exports){
module.exports={
  "title":"Pointer events",
  "description":"This specification integrates various inputs from mice, touchscreens, and pens, making separate implementations no longer necessary and authoring for cross-device pointers easier. Not to be mistaken with the unrelated \"pointer-events\" CSS property.",
  "spec":"http://www.w3.org/TR/pointerevents/",
  "status":"rec",
  "links":[
    {
      "url":"http://blogs.msdn.com/b/ie/archive/2011/09/20/touch-input-for-ie10-and-metro-style-apps.aspx",
      "title":"Implementation of Pointer Events in IE10"
    },
    {
      "url":"http://blogs.msdn.com/b/eternalcoding/archive/2013/01/16/hand-js-a-polyfill-for-supporting-pointer-events-on-every-browser.aspx",
      "title":"Hand.js, the polyfill for browsers only supporting Touch Events"
    },
    {
      "url":"http://blogs.msdn.com/b/davrous/archive/2013/02/20/handling-touch-in-your-html5-apps-thanks-to-the-pointer-events-of-ie10-and-windows-8.aspx",
      "title":"Article & tutorial"
    },
    {
      "url":"http://deeptissuejs.com",
      "title":"Abstraction library for pointer events"
    }
  ],
  "bugs":[
    
  ],
  "categories":[
    "DOM",
    "JS API"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"a x #1",
      "11":"y"
    },
    "edge":{
      "12":"y",
      "13":"y",
      "14":"y"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"n",
      "4":"n",
      "5":"n",
      "6":"p",
      "7":"p",
      "8":"p",
      "9":"p",
      "10":"p",
      "11":"p",
      "12":"p",
      "13":"p",
      "14":"p",
      "15":"p",
      "16":"p",
      "17":"p",
      "18":"p",
      "19":"p",
      "20":"p",
      "21":"p",
      "22":"p",
      "23":"p",
      "24":"p",
      "25":"p",
      "26":"p",
      "27":"p",
      "28":"p",
      "29":"p",
      "30":"p",
      "31":"p",
      "32":"p",
      "33":"p",
      "34":"p",
      "35":"p",
      "36":"p",
      "37":"p",
      "38":"p",
      "39":"p",
      "40":"p",
      "41":"p d #2",
      "42":"p d #2",
      "43":"p d #2",
      "44":"p d #2",
      "45":"p d #2",
      "46":"p d #2",
      "47":"p d #2",
      "48":"a #2",
      "49":"a #2",
      "50":"a #2"
    },
    "chrome":{
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"p",
      "23":"p",
      "24":"p",
      "25":"p",
      "26":"p",
      "27":"p",
      "28":"p",
      "29":"p",
      "30":"p",
      "31":"p",
      "32":"p",
      "33":"p",
      "34":"p",
      "35":"p",
      "36":"p",
      "37":"p",
      "38":"p",
      "39":"p",
      "40":"p",
      "41":"p",
      "42":"p",
      "43":"p",
      "44":"p",
      "45":"p",
      "46":"p",
      "47":"p",
      "48":"p",
      "49":"p",
      "50":"p",
      "51":"p",
      "52":"p d #3",
      "53":"p d #3",
      "54":"p d #3"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"n",
      "5":"n",
      "5.1":"n",
      "6":"n",
      "6.1":"p",
      "7":"p",
      "7.1":"p",
      "8":"p",
      "9":"p",
      "9.1":"p",
      "10":"p",
      "TP":"p"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"n",
      "12":"n",
      "12.1":"n",
      "15":"p",
      "16":"p",
      "17":"p",
      "18":"p",
      "19":"p",
      "20":"p",
      "21":"p",
      "22":"p",
      "23":"p",
      "24":"p",
      "25":"p",
      "26":"p",
      "27":"p",
      "28":"p",
      "29":"p",
      "30":"p",
      "31":"p",
      "32":"p",
      "33":"p",
      "34":"p",
      "35":"p",
      "36":"p",
      "37":"p",
      "38":"p",
      "39":"p d #3",
      "40":"p d #3"
    },
    "ios_saf":{
      "3.2":"p",
      "4.0-4.1":"p",
      "4.2-4.3":"p",
      "5.0-5.1":"p",
      "6.0-6.1":"p",
      "7.0-7.1":"p",
      "8":"p",
      "8.1-8.4":"p",
      "9.0-9.2":"p",
      "9.3":"p"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"p",
      "2.2":"p",
      "2.3":"p",
      "3":"p",
      "4":"p",
      "4.1":"p",
      "4.2-4.3":"p",
      "4.4":"p",
      "4.4.3-4.4.4":"p",
      "50":"p"
    },
    "bb":{
      "7":"p",
      "10":"p"
    },
    "op_mob":{
      "10":"n",
      "11":"p",
      "11.1":"p",
      "11.5":"p",
      "12":"p",
      "12.1":"p",
      "37":"p"
    },
    "and_chr":{
      "51":"p"
    },
    "and_ff":{
      "46":"p"
    },
    "ie_mob":{
      "10":"a x",
      "11":"y"
    },
    "and_uc":{
      "9.9":"p"
    },
    "samsung":{
      "4":"p"
    }
  },
  "notes":"Firefox, starting with version 28, provides the 'dom.w3c_pointer_events.enabled' flag to support this specification.",
  "notes_by_num":{
    "1":"Partial support in IE10 refers the lack of pointerenter and pointerleave events.",
    "2":"Firefox support is disabled by default and [only supports mouse input](https://hacks.mozilla.org/2015/08/pointer-events-now-in-firefox-nightly/). On Windows only, touch can be enabled with the `layers.async-pan-zoom.enabled` and `dom.w3c_touch_events.enabled` flags",
    "3":"Can be enabled with the `#enable-pointer-events` flag."
  },
  "usage_perc_y":6.92,
  "usage_perc_a":0.73,
  "ucprefix":false,
  "parent":"",
  "keywords":"pointerdown,pointermove,pointerup,pointercancel,pointerover,pointerout,pointerenter,pointerleave",
  "ie_id":"pointerevents",
  "chrome_id":"4504699138998272",
  "firefox_id":"pointer-events",
  "webkit_id":"",
  "shown":true
}

},{}],92:[function(require,module,exports){
module.exports={
  "title":"text-decoration styling",
  "description":"Method of defining the type, style and color of lines in the text-decoration property. These can be defined as shorthand (e.g. `text-decoration: line-through dashed blue`) or as single properties (e.g. `text-decoration-color: blue`)",
  "spec":"http://www.w3.org/TR/css-text-decor-3/#line-decoration",
  "status":"cr",
  "links":[
    {
      "url":"https://developer.mozilla.org/en-US/docs/Web/CSS/text-decoration-style",
      "title":"MDN Documentation for text-decoration-style"
    },
    {
      "url":"https://developer.mozilla.org/en-US/docs/Web/CSS/text-decoration-color",
      "title":"MDN Documentation for text-decoration-color"
    },
    {
      "url":"https://developer.mozilla.org/en-US/docs/Web/CSS/text-decoration-line",
      "title":"MDN Documentation for text-decoration-line"
    },
    {
      "url":"https://wpdev.uservoice.com/forums/257854-microsoft-edge-developer/suggestions/6514536-text-decoration-styling",
      "title":"Microsoft Edge feature request on UserVoice"
    }
  ],
  "bugs":[
    
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n"
    },
    "edge":{
      "12":"n",
      "13":"n",
      "14":"u"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"n",
      "4":"n",
      "5":"n",
      "6":"y x",
      "7":"y x",
      "8":"y x",
      "9":"y x",
      "10":"y x",
      "11":"y x",
      "12":"y x",
      "13":"y x",
      "14":"y x",
      "15":"y x",
      "16":"y x",
      "17":"y x",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y x",
      "27":"y x",
      "28":"y x",
      "29":"y x",
      "30":"y x",
      "31":"y x",
      "32":"y x",
      "33":"y x",
      "34":"y x",
      "35":"y x",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y"
    },
    "chrome":{
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"n",
      "25":"n",
      "26":"n x d #1",
      "27":"n x d #1",
      "28":"n x d #1",
      "29":"n x d #1",
      "30":"n x d #1",
      "31":"n x d #1",
      "32":"n x d #1",
      "33":"n x d #1",
      "34":"n x d #1",
      "35":"n x d #1",
      "36":"n x d #1",
      "37":"n x d #1",
      "38":"n x d #1",
      "39":"n x d #1",
      "40":"n x d #1",
      "41":"n x d #1",
      "42":"n x d #1",
      "43":"n x d #1",
      "44":"n x d #1",
      "45":"n x d #1",
      "46":"n x d #1",
      "47":"n x d #1",
      "48":"n x d #1",
      "49":"n x d #1",
      "50":"n x d #1",
      "51":"n x d #1",
      "52":"n x d #1",
      "53":"n x d #1",
      "54":"n x d #1"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"n",
      "5":"n",
      "5.1":"n",
      "6":"n",
      "6.1":"n",
      "7":"n",
      "7.1":"a x #2",
      "8":"a x #2",
      "9":"a x #2",
      "9.1":"a x #2",
      "10":"a x #2",
      "TP":"a x #2"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"n",
      "12":"n",
      "12.1":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"n",
      "25":"n",
      "26":"n",
      "27":"n",
      "28":"n",
      "29":"n",
      "30":"n",
      "31":"n",
      "32":"n",
      "33":"n",
      "34":"n",
      "35":"n x d #1",
      "36":"n x d #1",
      "37":"n x d #1",
      "38":"n x d #1",
      "39":"n x d #1",
      "40":"n x d #1"
    },
    "ios_saf":{
      "3.2":"n",
      "4.0-4.1":"n",
      "4.2-4.3":"n",
      "5.0-5.1":"n",
      "6.0-6.1":"n",
      "7.0-7.1":"n",
      "8":"a x #2",
      "8.1-8.4":"a x #2",
      "9.0-9.2":"a x #2",
      "9.3":"a x #2"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"n",
      "2.2":"n",
      "2.3":"n",
      "3":"n",
      "4":"n",
      "4.1":"n",
      "4.2-4.3":"n",
      "4.4":"n",
      "4.4.3-4.4.4":"n",
      "50":"n"
    },
    "bb":{
      "7":"n",
      "10":"n"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "12":"n",
      "12.1":"n",
      "37":"n"
    },
    "and_chr":{
      "51":"n x d #1"
    },
    "and_ff":{
      "46":"y"
    },
    "ie_mob":{
      "10":"n",
      "11":"n"
    },
    "and_uc":{
      "9.9":"n"
    },
    "samsung":{
      "4":"n"
    }
  },
  "notes":"All browsers support the CSS2 version of `text-decoration`, which matches only the `text-decoration-line` values (`underline`, etc.)",
  "notes_by_num":{
    "1":"Enabled in Chrome through the \"experimental Web Platform features\" flag in chrome://flags",
    "2":"Partial support in Safari refers to not supporting the text-decoration-style property."
  },
  "usage_perc_y":8.18,
  "usage_perc_a":10.75,
  "ucprefix":false,
  "parent":"",
  "keywords":"text-decoration-line,text-decoration-style,text-decoration-color",
  "ie_id":"",
  "chrome_id":"",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],93:[function(require,module,exports){
module.exports={
  "title":"text-emphasis styling",
  "description":"Method of using small symbols next to each glyph to emphasize a run of text, commonly used in East Asian languages. The `text-emphasis` shorthand, and its `text-emphasis-style` and `text-emphasis-color` longhands, can be used to apply marks to the text. The `text-emphasis-position` property, which inherits separately, allows setting the emphasis marks' position with respect to the text.",
  "spec":"https://drafts.csswg.org/css-text-decor-3/#text-emphasis-property",
  "status":"cr",
  "links":[
    {
      "url":"https://github.com/zmmbreeze/jquery.emphasis/",
      "title":"A javascript fallback for CSS3 emphasis mark."
    },
    {
      "url":"https://wpdev.uservoice.com/forums/257854-microsoft-edge-developer/suggestions/6514536-text-decoration-styling",
      "title":"Microsoft Edge feature request on UserVoice"
    },
    {
      "url":"https://developer.mozilla.org/en-US/docs/Web/CSS/text-emphasis",
      "title":"Mozilla Developer Network"
    }
  ],
  "bugs":[
    {
      "description":"Chrome on Android occasionally has issues rendering emphasis glyphs correctly."
    }
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n"
    },
    "edge":{
      "12":"n",
      "13":"n",
      "14":"u"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"n",
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"n",
      "25":"n",
      "26":"n",
      "27":"n",
      "28":"n",
      "29":"n",
      "30":"n",
      "31":"n",
      "32":"n",
      "33":"n",
      "34":"n",
      "35":"n",
      "36":"n",
      "37":"n",
      "38":"n",
      "39":"n",
      "40":"n",
      "41":"n",
      "42":"n",
      "43":"n",
      "44":"n",
      "45":"n d #2",
      "46":"n d #2",
      "47":"n d #2",
      "48":"n d #2",
      "49":"n d #2",
      "50":"n d #2"
    },
    "chrome":{
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"n",
      "25":"a x #1",
      "26":"a x #1",
      "27":"a x #1",
      "28":"a x #1",
      "29":"a x #1",
      "30":"a x #1",
      "31":"a x #1",
      "32":"a x #1",
      "33":"a x #1",
      "34":"a x #1",
      "35":"a x #1",
      "36":"a x #1",
      "37":"a x #1",
      "38":"a x #1",
      "39":"a x #1",
      "40":"a x #1",
      "41":"a x #1",
      "42":"a x #1",
      "43":"a x #1",
      "44":"a x #1",
      "45":"a x #1",
      "46":"a x #1",
      "47":"a x #1",
      "48":"a x #1",
      "49":"a x #1",
      "50":"a x #1",
      "51":"a x #1",
      "52":"a x #1",
      "53":"a x #1",
      "54":"a x #1"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"n",
      "5":"n",
      "5.1":"n",
      "6":"n",
      "6.1":"a x #1",
      "7":"a x #1",
      "7.1":"y",
      "8":"y",
      "9":"y",
      "9.1":"y",
      "10":"y",
      "TP":"y"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"n",
      "12":"n",
      "12.1":"n",
      "15":"a x #1",
      "16":"a x #1",
      "17":"a x #1",
      "18":"a x #1",
      "19":"a x #1",
      "20":"a x #1",
      "21":"a x #1",
      "22":"a x #1",
      "23":"a x #1",
      "24":"a x #1",
      "25":"a x #1",
      "26":"a x #1",
      "27":"a x #1",
      "28":"a x #1",
      "29":"a x #1",
      "30":"a x #1",
      "31":"a x #1",
      "32":"a x #1",
      "33":"a x #1",
      "34":"a x #1",
      "35":"a x #1",
      "36":"a x #1",
      "37":"a x #1",
      "38":"a x #1",
      "39":"a x #1",
      "40":"a x #1"
    },
    "ios_saf":{
      "3.2":"n",
      "4.0-4.1":"n",
      "4.2-4.3":"n",
      "5.0-5.1":"n",
      "6.0-6.1":"n",
      "7.0-7.1":"y",
      "8":"y",
      "8.1-8.4":"y",
      "9.0-9.2":"y",
      "9.3":"y"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"n",
      "2.2":"n",
      "2.3":"n",
      "3":"n",
      "4":"n",
      "4.1":"n",
      "4.2-4.3":"n",
      "4.4":"a x #1",
      "4.4.3-4.4.4":"a x #1",
      "50":"a x #1"
    },
    "bb":{
      "7":"n",
      "10":"a x #1"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "12":"n",
      "12.1":"n",
      "37":"a x #1"
    },
    "and_chr":{
      "51":"a x #1"
    },
    "and_ff":{
      "46":"n"
    },
    "ie_mob":{
      "10":"n",
      "11":"n"
    },
    "and_uc":{
      "9.9":"a x #1"
    },
    "samsung":{
      "4":"a x #1"
    }
  },
  "notes":"Some old WebKit browsers (like Chrome 24) support `-webkit-text-emphasis`, but does not support CJK languages and is therefore considered unsupported.",
  "notes_by_num":{
    "1":"Partial support refers to incorrect support for `-webkit-text-emphasis-position`. These browsers support `over` and `under` as values, but not the added `left` and `right` values required by the spec.",
    "2":"Can be enabled in Firefox using the `layout.css.text-emphasis.enabled` flag"
  },
  "usage_perc_y":10.98,
  "usage_perc_a":63.62,
  "ucprefix":false,
  "parent":"",
  "keywords":"text-emphasis,text-emphasis-position,text-emphasis-style,text-emphasis-color",
  "ie_id":"",
  "chrome_id":"",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],94:[function(require,module,exports){
module.exports={
  "title":"CSS3 Text-overflow",
  "description":"Append ellipsis when text overflows its containing element",
  "spec":"http://www.w3.org/TR/css3-ui/#text-overflow",
  "status":"cr",
  "links":[
    {
      "url":"https://github.com/rmorse/AutoEllipsis",
      "title":"jQuery polyfill for Firefox"
    },
    {
      "url":"https://developer.mozilla.org/En/CSS/Text-overflow",
      "title":"MDN article"
    },
    {
      "url":"http://www.css3files.com/text/",
      "title":"Information page"
    },
    {
      "url":"https://raw.github.com/phiggins42/has.js/master/detect/css.js#css-text-overflow",
      "title":"has.js test"
    },
    {
      "url":"http://docs.webplatform.org/wiki/css/properties/text-overflow",
      "title":"WebPlatform Docs"
    }
  ],
  "bugs":[
    {
      "description":"Does not work on `select` elements work in Chrome and IE, only Firefox."
    },
    {
      "description":"Some Samsung-based browsers, have a bug with overflowing text when ellipsis is set and if `text-rendering` is not `auto`."
    },
    {
      "description":"Does not work in IE8 and IE9 on `<input type=\"text\">`"
    }
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"y",
      "7":"y",
      "8":"y",
      "9":"y",
      "10":"y",
      "11":"y"
    },
    "edge":{
      "12":"y",
      "13":"y",
      "14":"y"
    },
    "firefox":{
      "2":"p",
      "3":"p",
      "3.5":"p",
      "3.6":"p",
      "4":"p",
      "5":"p",
      "6":"p",
      "7":"y",
      "8":"y",
      "9":"y",
      "10":"y",
      "11":"y",
      "12":"y",
      "13":"y",
      "14":"y",
      "15":"y",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y"
    },
    "chrome":{
      "4":"y",
      "5":"y",
      "6":"y",
      "7":"y",
      "8":"y",
      "9":"y",
      "10":"y",
      "11":"y",
      "12":"y",
      "13":"y",
      "14":"y",
      "15":"y",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y",
      "51":"y",
      "52":"y",
      "53":"y",
      "54":"y"
    },
    "safari":{
      "3.1":"y",
      "3.2":"y",
      "4":"y",
      "5":"y",
      "5.1":"y",
      "6":"y",
      "6.1":"y",
      "7":"y",
      "7.1":"y",
      "8":"y",
      "9":"y",
      "9.1":"y",
      "10":"y",
      "TP":"y"
    },
    "opera":{
      "9":"y x",
      "9.5-9.6":"y x",
      "10.0-10.1":"y x",
      "10.5":"y x",
      "10.6":"y x",
      "11":"y",
      "11.1":"y",
      "11.5":"y",
      "11.6":"y",
      "12":"y",
      "12.1":"y",
      "15":"y",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y"
    },
    "ios_saf":{
      "3.2":"y",
      "4.0-4.1":"y",
      "4.2-4.3":"y",
      "5.0-5.1":"y",
      "6.0-6.1":"y",
      "7.0-7.1":"y",
      "8":"y",
      "8.1-8.4":"y",
      "9.0-9.2":"y",
      "9.3":"y"
    },
    "op_mini":{
      "all":"y"
    },
    "android":{
      "2.1":"y",
      "2.2":"y",
      "2.3":"y",
      "3":"y",
      "4":"y",
      "4.1":"y",
      "4.2-4.3":"y",
      "4.4":"y",
      "4.4.3-4.4.4":"y",
      "50":"y"
    },
    "bb":{
      "7":"y",
      "10":"y"
    },
    "op_mob":{
      "10":"y x",
      "11":"y x",
      "11.1":"y x",
      "11.5":"y x",
      "12":"y x",
      "12.1":"y",
      "37":"y"
    },
    "and_chr":{
      "51":"y"
    },
    "and_ff":{
      "46":"y"
    },
    "ie_mob":{
      "10":"y",
      "11":"y"
    },
    "and_uc":{
      "9.9":"y"
    },
    "samsung":{
      "4":"y"
    }
  },
  "notes":"",
  "notes_by_num":{
    
  },
  "usage_perc_y":97.87,
  "usage_perc_a":0,
  "ucprefix":false,
  "parent":"",
  "keywords":"textoverflow,ellipsis",
  "ie_id":"",
  "chrome_id":"",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],95:[function(require,module,exports){
module.exports={
  "title":"CSS text-size-adjust",
  "description":"On mobile devices, the text-size-adjust CSS property allows Web authors to control if and how the text-inflating algorithm is applied to the textual content of the element it is applied to.",
  "spec":"http://dev.w3.org/csswg/css-size-adjust/",
  "status":"unoff",
  "links":[
    {
      "url":"https://developer.mozilla.org/en-US/docs/Web/CSS/text-size-adjust",
      "title":"MDN Docs"
    }
  ],
  "bugs":[
    
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n"
    },
    "edge":{
      "12":"n",
      "13":"n",
      "14":"u"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"n",
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"n",
      "25":"n",
      "26":"n",
      "27":"n",
      "28":"n",
      "29":"n",
      "30":"n",
      "31":"n",
      "32":"n",
      "33":"n",
      "34":"n",
      "35":"n",
      "36":"n",
      "37":"n",
      "38":"n",
      "39":"n",
      "40":"n",
      "41":"n",
      "42":"n",
      "43":"n",
      "44":"n",
      "45":"n",
      "46":"n",
      "47":"n",
      "48":"n",
      "49":"n",
      "50":"n"
    },
    "chrome":{
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"n",
      "13":"n",
      "14":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"n",
      "25":"n",
      "26":"n #2",
      "27":"n",
      "28":"n",
      "29":"n",
      "30":"n",
      "31":"n",
      "32":"n",
      "33":"n",
      "34":"n",
      "35":"n",
      "36":"n",
      "37":"n",
      "38":"n",
      "39":"n",
      "40":"n",
      "41":"n",
      "42":"n",
      "43":"n",
      "44":"n",
      "45":"n",
      "46":"n",
      "47":"n",
      "48":"n",
      "49":"n",
      "50":"n",
      "51":"n",
      "52":"n",
      "53":"n",
      "54":"n"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"n",
      "5":"n",
      "5.1":"n #2",
      "6":"n",
      "6.1":"n",
      "7":"n",
      "7.1":"n",
      "8":"n",
      "9":"n",
      "9.1":"n",
      "10":"n",
      "TP":"n"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"n",
      "12":"n",
      "12.1":"n",
      "15":"n",
      "16":"n",
      "17":"n",
      "18":"n",
      "19":"n",
      "20":"n",
      "21":"n",
      "22":"n",
      "23":"n",
      "24":"n",
      "25":"n",
      "26":"n",
      "27":"n",
      "28":"n",
      "29":"n",
      "30":"n",
      "31":"n",
      "32":"n",
      "33":"n",
      "34":"n",
      "35":"n",
      "36":"n",
      "37":"n",
      "38":"n",
      "39":"n",
      "40":"n"
    },
    "ios_saf":{
      "3.2":"n",
      "4.0-4.1":"n",
      "4.2-4.3":"n",
      "5.0-5.1":"y x",
      "6.0-6.1":"y x",
      "7.0-7.1":"y x",
      "8":"y x",
      "8.1-8.4":"y x",
      "9.0-9.2":"y x",
      "9.3":"y x"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"n",
      "2.2":"n",
      "2.3":"n",
      "3":"n",
      "4":"n",
      "4.1":"n",
      "4.2-4.3":"n",
      "4.4":"n",
      "4.4.3-4.4.4":"n",
      "50":"n"
    },
    "bb":{
      "7":"n",
      "10":"n"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "12":"n",
      "12.1":"n",
      "37":"n"
    },
    "and_chr":{
      "51":"n"
    },
    "and_ff":{
      "46":"y x"
    },
    "ie_mob":{
      "10":"y x #1",
      "11":"y x #1"
    },
    "and_uc":{
      "9.9":"y x"
    },
    "samsung":{
      "4":"n"
    }
  },
  "notes":"",
  "notes_by_num":{
    "1":"If the viewport size is set using a `<meta>` element, the `-ms-text-size-adjust` property is ignored. See [MSDN](https://msdn.microsoft.com/en-us/library/ie/dn793579%28v=vs.85%29.aspx)",
    "2":"Old versions of WebKit-based desktop browsers (Chrome<27, Safari<6) [suffer from a bug](https://bugs.webkit.org/show_bug.cgi?id=56543) where if `-webkit-text-size-adjust` is explicitly set to `none`, instead of ignoring the property, the browsers will prevent the user from zooming in or out on the webpage."
  },
  "usage_perc_y":16.3,
  "usage_perc_a":0,
  "ucprefix":false,
  "parent":"",
  "keywords":"",
  "ie_id":"",
  "chrome_id":"",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],96:[function(require,module,exports){
module.exports={
  "title":"CSS3 2D Transforms",
  "description":"Method of transforming an element including rotating, scaling, etc. Includes support for `transform` as well as `transform-origin` properties.",
  "spec":"http://www.w3.org/TR/css3-2d-transforms/",
  "status":"wd",
  "links":[
    {
      "url":"http://www.westciv.com/tools/transforms/",
      "title":"Live editor"
    },
    {
      "url":"https://developer.mozilla.org/en-US/docs/Web/CSS/transform",
      "title":"MDN article"
    },
    {
      "url":"http://www.webresourcesdepot.com/cross-browser-css-transforms-csssandpaper/",
      "title":"Workaround script for IE"
    },
    {
      "url":"http://www.css3files.com/transform/",
      "title":"Information page"
    },
    {
      "url":"http://www.useragentman.com/IETransformsTranslator/",
      "title":"Converter for IE"
    },
    {
      "url":"https://raw.github.com/phiggins42/has.js/master/detect/css.js#css-transform",
      "title":"has.js test"
    },
    {
      "url":"http://docs.webplatform.org/wiki/css/transforms/transform",
      "title":"WebPlatform Docs"
    }
  ],
  "bugs":[
    {
      "description":"Scaling transforms in Android 2.3 fails to scale element background images."
    },
    {
      "description":"IE 10 and below does not support CSS transforms on SVG elements (though SVG transform attributes do work)."
    },
    {
      "description":"In IE9 the caret of a `textarea` disappears when you use translate."
    },
    {
      "description":"Firefox 42 and below do not support [`transform-origin` on SVG elements](https://bugzilla.mozilla.org/show_bug.cgi?id=923193). "
    }
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"p",
      "7":"p",
      "8":"p",
      "9":"y x",
      "10":"y",
      "11":"y"
    },
    "edge":{
      "12":"y",
      "13":"y",
      "14":"y"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"y x",
      "3.6":"y x",
      "4":"y x",
      "5":"y x",
      "6":"y x",
      "7":"y x",
      "8":"y x",
      "9":"y x",
      "10":"y x",
      "11":"y x",
      "12":"y x",
      "13":"y x",
      "14":"y x",
      "15":"y x",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y"
    },
    "chrome":{
      "4":"y x",
      "5":"y x",
      "6":"y x",
      "7":"y x",
      "8":"y x",
      "9":"y x",
      "10":"y x",
      "11":"y x",
      "12":"y x",
      "13":"y x",
      "14":"y x",
      "15":"y x",
      "16":"y x",
      "17":"y x",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y x",
      "27":"y x",
      "28":"y x",
      "29":"y x",
      "30":"y x",
      "31":"y x",
      "32":"y x",
      "33":"y x",
      "34":"y x",
      "35":"y x",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y",
      "51":"y",
      "52":"y",
      "53":"y",
      "54":"y"
    },
    "safari":{
      "3.1":"y x",
      "3.2":"y x",
      "4":"y x",
      "5":"y x",
      "5.1":"y x",
      "6":"y x",
      "6.1":"y x",
      "7":"y x",
      "7.1":"y x",
      "8":"y x",
      "9":"y",
      "9.1":"y",
      "10":"y",
      "TP":"y"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"y x",
      "10.6":"y x",
      "11":"y x",
      "11.1":"y x",
      "11.5":"y x",
      "11.6":"y x",
      "12":"y x",
      "12.1":"y",
      "15":"y x",
      "16":"y x",
      "17":"y x",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y"
    },
    "ios_saf":{
      "3.2":"y x",
      "4.0-4.1":"y x",
      "4.2-4.3":"y x",
      "5.0-5.1":"y x",
      "6.0-6.1":"y x",
      "7.0-7.1":"y x",
      "8":"y x",
      "8.1-8.4":"y x",
      "9.0-9.2":"y",
      "9.3":"y"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"y x",
      "2.2":"y x",
      "2.3":"y x",
      "3":"y x",
      "4":"y x",
      "4.1":"y x",
      "4.2-4.3":"y x",
      "4.4":"y x",
      "4.4.3-4.4.4":"y x",
      "50":"y"
    },
    "bb":{
      "7":"y x",
      "10":"y x"
    },
    "op_mob":{
      "10":"n",
      "11":"y",
      "11.1":"y",
      "11.5":"y",
      "12":"y",
      "12.1":"y",
      "37":"y"
    },
    "and_chr":{
      "51":"y"
    },
    "and_ff":{
      "46":"y"
    },
    "ie_mob":{
      "10":"y",
      "11":"y"
    },
    "and_uc":{
      "9.9":"y x"
    },
    "samsung":{
      "4":"y"
    }
  },
  "notes":"The scale transform can be emulated in IE < 9 using Microsoft's \"zoom\" extension, others are (not easily) possible using the MS Matrix filter",
  "notes_by_num":{
    
  },
  "usage_perc_y":92.55,
  "usage_perc_a":0,
  "ucprefix":false,
  "parent":"",
  "keywords":"transformation,translate,translatex,translatey,translatez,transform3d,rotation,rotate,scale,css-transforms,transform-origin,transform:rotate,transform:scale",
  "ie_id":"transforms",
  "chrome_id":"6437640580628480",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],97:[function(require,module,exports){
module.exports={
  "title":"CSS3 3D Transforms",
  "description":"Method of transforming an element in the third dimension using the `transform` property. Includes support for the `perspective` property to set the perspective in z-space and the `backface-visibility` property to toggle display of the reverse side of a 3D-transformed element.",
  "spec":"http://www.w3.org/TR/css3-3d-transforms/",
  "status":"wd",
  "links":[
    {
      "url":"http://css3.bradshawenterprises.com/flip/",
      "title":"Multi-browser demo"
    },
    {
      "url":"http://hacks.mozilla.org/2011/10/css-3d-transformations-in-firefox-nightly/",
      "title":"Mozilla hacks article"
    },
    {
      "url":"http://thewebrocks.com/demos/3D-css-tester/",
      "title":"3D CSS Tester"
    },
    {
      "url":"https://raw.github.com/phiggins42/has.js/master/detect/css.js#css-transform",
      "title":"has.js test"
    },
    {
      "url":"http://docs.webplatform.org/wiki/css/transforms/transform",
      "title":"WebPlatform Docs"
    },
    {
      "url":"http://desandro.github.io/3dtransforms/",
      "title":"Intro to CSS 3D transforms"
    }
  ],
  "bugs":[
    {
      "description":"Some configurations of Linux and older Windows machines (those without WebGL support) have trouble with 3D transforms and will treat them as if `perspective` was set as `none`."
    },
    {
      "description":"Firefox on Windows [incorrectly renders plugin content within no-op 3D transforms](https://bugzilla.mozilla.org/show_bug.cgi?id=1048279)."
    },
    {
      "description":"The `perspective` property doesn't work on the `body` element in Firefox, it must be used on an inner element."
    },
    {
      "description":"Chrome has a (recently fixed) bug where combining `clip-path` and `backface-visibility` produces [visible noise](https://code.google.com/p/chromium/issues/detail?id=350724)."
    },
    {
      "description":"Transforms may break position:fixed styles of contained elements"
    }
  ],
  "categories":[
    "CSS3"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"a #1",
      "11":"a #1"
    },
    "edge":{
      "12":"y",
      "13":"y",
      "14":"y"
    },
    "firefox":{
      "2":"n",
      "3":"n",
      "3.5":"n",
      "3.6":"n",
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"y x",
      "11":"y x",
      "12":"y x",
      "13":"y x",
      "14":"y x",
      "15":"y x",
      "16":"y",
      "17":"y",
      "18":"y",
      "19":"y",
      "20":"y",
      "21":"y",
      "22":"y",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y"
    },
    "chrome":{
      "4":"n",
      "5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"n",
      "11":"n",
      "12":"y x",
      "13":"y x",
      "14":"y x",
      "15":"y x",
      "16":"y x",
      "17":"y x",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y x",
      "27":"y x",
      "28":"y x",
      "29":"y x",
      "30":"y x",
      "31":"y x",
      "32":"y x",
      "33":"y x",
      "34":"y x",
      "35":"y x",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y",
      "41":"y",
      "42":"y",
      "43":"y",
      "44":"y",
      "45":"y",
      "46":"y",
      "47":"y",
      "48":"y",
      "49":"y",
      "50":"y",
      "51":"y",
      "52":"y",
      "53":"y",
      "54":"y"
    },
    "safari":{
      "3.1":"n",
      "3.2":"n",
      "4":"y x",
      "5":"y x",
      "5.1":"y x",
      "6":"y x",
      "6.1":"y x",
      "7":"y x",
      "7.1":"y x",
      "8":"y x",
      "9":"y #2",
      "9.1":"y #2",
      "10":"y #2",
      "TP":"y #2"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"n",
      "12":"n",
      "12.1":"n",
      "15":"y x",
      "16":"y x",
      "17":"y x",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y",
      "24":"y",
      "25":"y",
      "26":"y",
      "27":"y",
      "28":"y",
      "29":"y",
      "30":"y",
      "31":"y",
      "32":"y",
      "33":"y",
      "34":"y",
      "35":"y",
      "36":"y",
      "37":"y",
      "38":"y",
      "39":"y",
      "40":"y"
    },
    "ios_saf":{
      "3.2":"y x",
      "4.0-4.1":"y x",
      "4.2-4.3":"y x",
      "5.0-5.1":"y x",
      "6.0-6.1":"y x",
      "7.0-7.1":"y x",
      "8":"y x",
      "8.1-8.4":"y x",
      "9.0-9.2":"y",
      "9.3":"y"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"n",
      "2.2":"n",
      "2.3":"n",
      "3":"y x",
      "4":"y x",
      "4.1":"y x",
      "4.2-4.3":"y x",
      "4.4":"y x",
      "4.4.3-4.4.4":"y x",
      "50":"y"
    },
    "bb":{
      "7":"y x",
      "10":"y x"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "12":"n",
      "12.1":"n",
      "37":"y"
    },
    "and_chr":{
      "51":"y"
    },
    "and_ff":{
      "46":"y"
    },
    "ie_mob":{
      "10":"a #1",
      "11":"a #1"
    },
    "and_uc":{
      "9.9":"y x"
    },
    "samsung":{
      "4":"y"
    }
  },
  "notes":"",
  "notes_by_num":{
    "1":"Partial support in IE refers to not supporting [the transform-style: preserve-3d property](http://msdn.microsoft.com/en-us/library/ie/hh673529%28v=vs.85%29.aspx#the_ms_transform_style_property). This prevents nesting 3D transformed elements.",
    "2":"Safari 9 is reported to still require a prefix for the related `backface-visibility` property."
  },
  "usage_perc_y":85.68,
  "usage_perc_a":6.04,
  "ucprefix":false,
  "parent":"",
  "keywords":"css 3d,3dtransforms,translate3d,backface visibility,perspective,transform-origin,transform-style",
  "ie_id":"transforms,csstransformspreserve3d",
  "chrome_id":"6437640580628480",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],98:[function(require,module,exports){
module.exports={
  "title":"CSS user-select: none",
  "description":"Method of preventing text/element selection using CSS. ",
  "spec":"https://drafts.csswg.org/css-ui-4/#valdef-user-select-none",
  "status":"wd",
  "links":[
    {
      "url":"https://developer.mozilla.org/en-US/docs/CSS/user-select",
      "title":"MDN article"
    },
    {
      "url":"http://css-tricks.com/almanac/properties/u/user-select/",
      "title":"CSS Tricks article"
    },
    {
      "url":"http://msdn.microsoft.com/en-us/library/ie/hh781492(v=vs.85).aspx",
      "title":"MSDN Documentation"
    }
  ],
  "bugs":[
    {
      "description":"iOS does not allow input elements to be focused (and thus prevents text input) when the element has `-webkit-user-select: none` set"
    },
    {
      "description":"Reported to not work in some manufacturer's versions of Android 4.0 and below, though confirmed to work in others."
    }
  ],
  "categories":[
    "CSS"
  ],
  "stats":{
    "ie":{
      "5.5":"n",
      "6":"n",
      "7":"n",
      "8":"n",
      "9":"n",
      "10":"y x",
      "11":"y x"
    },
    "edge":{
      "12":"y x",
      "13":"y x",
      "14":"y x"
    },
    "firefox":{
      "2":"y x",
      "3":"y x",
      "3.5":"y x",
      "3.6":"y x",
      "4":"y x",
      "5":"y x",
      "6":"y x",
      "7":"y x",
      "8":"y x",
      "9":"y x",
      "10":"y x",
      "11":"y x",
      "12":"y x",
      "13":"y x",
      "14":"y x",
      "15":"y x",
      "16":"y x",
      "17":"y x",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y x",
      "27":"y x",
      "28":"y x",
      "29":"y x",
      "30":"y x",
      "31":"y x",
      "32":"y x",
      "33":"y x",
      "34":"y x",
      "35":"y x",
      "36":"y x",
      "37":"y x",
      "38":"y x",
      "39":"y x",
      "40":"y x",
      "41":"y x",
      "42":"y x",
      "43":"y x",
      "44":"y x",
      "45":"y x",
      "46":"y x",
      "47":"y x",
      "48":"y x",
      "49":"y x",
      "50":"y x"
    },
    "chrome":{
      "4":"y x",
      "5":"y x",
      "6":"y x",
      "7":"y x",
      "8":"y x",
      "9":"y x",
      "10":"y x",
      "11":"y x",
      "12":"y x",
      "13":"y x",
      "14":"y x",
      "15":"y x",
      "16":"y x",
      "17":"y x",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y x",
      "27":"y x",
      "28":"y x",
      "29":"y x",
      "30":"y x",
      "31":"y x",
      "32":"y x",
      "33":"y x",
      "34":"y x",
      "35":"y x",
      "36":"y x",
      "37":"y x",
      "38":"y x",
      "39":"y x",
      "40":"y x",
      "41":"y x",
      "42":"y x",
      "43":"y x",
      "44":"y x",
      "45":"y x",
      "46":"y x",
      "47":"y x",
      "48":"y x",
      "49":"y x",
      "50":"y x",
      "51":"y x",
      "52":"y x",
      "53":"y x",
      "54":"y x"
    },
    "safari":{
      "3.1":"y x",
      "3.2":"y x",
      "4":"y x",
      "5":"y x",
      "5.1":"y x",
      "6":"y x",
      "6.1":"y x",
      "7":"y x",
      "7.1":"y x",
      "8":"y x",
      "9":"y x",
      "9.1":"y x",
      "10":"y x",
      "TP":"y x"
    },
    "opera":{
      "9":"n",
      "9.5-9.6":"n",
      "10.0-10.1":"n",
      "10.5":"n",
      "10.6":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "11.6":"n",
      "12":"n",
      "12.1":"n",
      "15":"y x",
      "16":"y x",
      "17":"y x",
      "18":"y x",
      "19":"y x",
      "20":"y x",
      "21":"y x",
      "22":"y x",
      "23":"y x",
      "24":"y x",
      "25":"y x",
      "26":"y x",
      "27":"y x",
      "28":"y x",
      "29":"y x",
      "30":"y x",
      "31":"y x",
      "32":"y x",
      "33":"y x",
      "34":"y x",
      "35":"y x",
      "36":"y x",
      "37":"y x",
      "38":"y x",
      "39":"y x",
      "40":"y x"
    },
    "ios_saf":{
      "3.2":"y x",
      "4.0-4.1":"y x",
      "4.2-4.3":"y x",
      "5.0-5.1":"y x",
      "6.0-6.1":"y x",
      "7.0-7.1":"y x",
      "8":"y x",
      "8.1-8.4":"y x",
      "9.0-9.2":"y x",
      "9.3":"y x"
    },
    "op_mini":{
      "all":"n"
    },
    "android":{
      "2.1":"y x",
      "2.2":"y x",
      "2.3":"y x",
      "3":"y x",
      "4":"y x",
      "4.1":"y x",
      "4.2-4.3":"y x",
      "4.4":"y x",
      "4.4.3-4.4.4":"y x",
      "50":"y x"
    },
    "bb":{
      "7":"y x",
      "10":"y x"
    },
    "op_mob":{
      "10":"n",
      "11":"n",
      "11.1":"n",
      "11.5":"n",
      "12":"n",
      "12.1":"n",
      "37":"y x"
    },
    "and_chr":{
      "51":"y x"
    },
    "and_ff":{
      "46":"y x"
    },
    "ie_mob":{
      "10":"y x",
      "11":"y x"
    },
    "and_uc":{
      "9.9":"y x"
    },
    "samsung":{
      "4":"y x"
    }
  },
  "notes":"",
  "notes_by_num":{
    
  },
  "usage_perc_y":92.01,
  "usage_perc_a":0,
  "ucprefix":false,
  "parent":"",
  "keywords":"",
  "ie_id":"",
  "chrome_id":"",
  "firefox_id":"",
  "webkit_id":"",
  "shown":true
}

},{}],99:[function(require,module,exports){
/**
 * Module dependencies.
 */

var type;
try {
  type = require('component-type');
} catch (_) {
  type = require('type');
}

/**
 * Module exports.
 */

module.exports = clone;

/**
 * Clones objects.
 *
 * @param {Mixed} any object
 * @api public
 */

function clone(obj){
  switch (type(obj)) {
    case 'object':
      var copy = {};
      for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
          copy[key] = clone(obj[key]);
        }
      }
      return copy;

    case 'array':
      var copy = new Array(obj.length);
      for (var i = 0, l = obj.length; i < l; i++) {
        copy[i] = clone(obj[i]);
      }
      return copy;

    case 'regexp':
      // from millermedeiros/amd-utils - MIT
      var flags = '';
      flags += obj.multiline ? 'm' : '';
      flags += obj.global ? 'g' : '';
      flags += obj.ignoreCase ? 'i' : '';
      return new RegExp(obj.source, flags);

    case 'date':
      return new Date(obj.getTime());

    default: // string, number, boolean, …
      return obj;
  }
}

},{"component-type":108,"type":108}],100:[function(require,module,exports){
(function (Buffer){
var clone = (function() {
'use strict';

/**
 * Clones (copies) an Object using deep copying.
 *
 * This function supports circular references by default, but if you are certain
 * there are no circular references in your object, you can save some CPU time
 * by calling clone(obj, false).
 *
 * Caution: if `circular` is false and `parent` contains circular references,
 * your program may enter an infinite loop and crash.
 *
 * @param `parent` - the object to be cloned
 * @param `circular` - set to true if the object to be cloned may contain
 *    circular references. (optional - true by default)
 * @param `depth` - set to a number if the object is only to be cloned to
 *    a particular depth. (optional - defaults to Infinity)
 * @param `prototype` - sets the prototype to be used when cloning an object.
 *    (optional - defaults to parent prototype).
*/
function clone(parent, circular, depth, prototype) {
  var filter;
  if (typeof circular === 'object') {
    depth = circular.depth;
    prototype = circular.prototype;
    filter = circular.filter;
    circular = circular.circular
  }
  // maintain two arrays for circular references, where corresponding parents
  // and children have the same index
  var allParents = [];
  var allChildren = [];

  var useBuffer = typeof Buffer != 'undefined';

  if (typeof circular == 'undefined')
    circular = true;

  if (typeof depth == 'undefined')
    depth = Infinity;

  // recurse this function so we don't reset allParents and allChildren
  function _clone(parent, depth) {
    // cloning null always returns null
    if (parent === null)
      return null;

    if (depth == 0)
      return parent;

    var child;
    var proto;
    if (typeof parent != 'object') {
      return parent;
    }

    if (clone.__isArray(parent)) {
      child = [];
    } else if (clone.__isRegExp(parent)) {
      child = new RegExp(parent.source, __getRegExpFlags(parent));
      if (parent.lastIndex) child.lastIndex = parent.lastIndex;
    } else if (clone.__isDate(parent)) {
      child = new Date(parent.getTime());
    } else if (useBuffer && Buffer.isBuffer(parent)) {
      child = new Buffer(parent.length);
      parent.copy(child);
      return child;
    } else {
      if (typeof prototype == 'undefined') {
        proto = Object.getPrototypeOf(parent);
        child = Object.create(proto);
      }
      else {
        child = Object.create(prototype);
        proto = prototype;
      }
    }

    if (circular) {
      var index = allParents.indexOf(parent);

      if (index != -1) {
        return allChildren[index];
      }
      allParents.push(parent);
      allChildren.push(child);
    }

    for (var i in parent) {
      var attrs;
      if (proto) {
        attrs = Object.getOwnPropertyDescriptor(proto, i);
      }

      if (attrs && attrs.set == null) {
        continue;
      }
      child[i] = _clone(parent[i], depth - 1);
    }

    return child;
  }

  return _clone(parent, depth);
}

/**
 * Simple flat clone using prototype, accepts only objects, usefull for property
 * override on FLAT configuration object (no nested props).
 *
 * USE WITH CAUTION! This may not behave as you wish if you do not know how this
 * works.
 */
clone.clonePrototype = function clonePrototype(parent) {
  if (parent === null)
    return null;

  var c = function () {};
  c.prototype = parent;
  return new c();
};

// private utility functions

function __objToStr(o) {
  return Object.prototype.toString.call(o);
};
clone.__objToStr = __objToStr;

function __isDate(o) {
  return typeof o === 'object' && __objToStr(o) === '[object Date]';
};
clone.__isDate = __isDate;

function __isArray(o) {
  return typeof o === 'object' && __objToStr(o) === '[object Array]';
};
clone.__isArray = __isArray;

function __isRegExp(o) {
  return typeof o === 'object' && __objToStr(o) === '[object RegExp]';
};
clone.__isRegExp = __isRegExp;

function __getRegExpFlags(re) {
  var flags = '';
  if (re.global) flags += 'g';
  if (re.ignoreCase) flags += 'i';
  if (re.multiline) flags += 'm';
  return flags;
};
clone.__getRegExpFlags = __getRegExpFlags;

return clone;
})();

if (typeof module === 'object' && module.exports) {
  module.exports = clone;
}

}).call(this,require("buffer").Buffer)
},{"buffer":3}],101:[function(require,module,exports){
/* MIT license */
var cssKeywords = require('./css-keywords');

// NOTE: conversions should only return primitive values (i.e. arrays, or
//       values that give correct `typeof` results).
//       do not use box values types (i.e. Number(), String(), etc.)

var reverseKeywords = {};
for (var key in cssKeywords) {
	if (cssKeywords.hasOwnProperty(key)) {
		reverseKeywords[cssKeywords[key].join()] = key;
	}
}

var convert = module.exports = {
	rgb: {channels: 3},
	hsl: {channels: 3},
	hsv: {channels: 3},
	hwb: {channels: 3},
	cmyk: {channels: 4},
	xyz: {channels: 3},
	lab: {channels: 3},
	lch: {channels: 3},
	hex: {channels: 1},
	keyword: {channels: 1},
	ansi16: {channels: 1},
	ansi256: {channels: 1},
	hcg: {channels: 3},
	apple: {channels: 3}
};

// hide .channels property
for (var model in convert) {
	if (convert.hasOwnProperty(model)) {
		if (!('channels' in convert[model])) {
			throw new Error('missing channels property: ' + model);
		}

		var channels = convert[model].channels;
		delete convert[model].channels;
		Object.defineProperty(convert[model], 'channels', {value: channels});
	}
}

convert.rgb.hsl = function (rgb) {
	var r = rgb[0] / 255;
	var g = rgb[1] / 255;
	var b = rgb[2] / 255;
	var min = Math.min(r, g, b);
	var max = Math.max(r, g, b);
	var delta = max - min;
	var h;
	var s;
	var l;

	if (max === min) {
		h = 0;
	} else if (r === max) {
		h = (g - b) / delta;
	} else if (g === max) {
		h = 2 + (b - r) / delta;
	} else if (b === max) {
		h = 4 + (r - g) / delta;
	}

	h = Math.min(h * 60, 360);

	if (h < 0) {
		h += 360;
	}

	l = (min + max) / 2;

	if (max === min) {
		s = 0;
	} else if (l <= 0.5) {
		s = delta / (max + min);
	} else {
		s = delta / (2 - max - min);
	}

	return [h, s * 100, l * 100];
};

convert.rgb.hsv = function (rgb) {
	var r = rgb[0];
	var g = rgb[1];
	var b = rgb[2];
	var min = Math.min(r, g, b);
	var max = Math.max(r, g, b);
	var delta = max - min;
	var h;
	var s;
	var v;

	if (max === 0) {
		s = 0;
	} else {
		s = (delta / max * 1000) / 10;
	}

	if (max === min) {
		h = 0;
	} else if (r === max) {
		h = (g - b) / delta;
	} else if (g === max) {
		h = 2 + (b - r) / delta;
	} else if (b === max) {
		h = 4 + (r - g) / delta;
	}

	h = Math.min(h * 60, 360);

	if (h < 0) {
		h += 360;
	}

	v = ((max / 255) * 1000) / 10;

	return [h, s, v];
};

convert.rgb.hwb = function (rgb) {
	var r = rgb[0];
	var g = rgb[1];
	var b = rgb[2];
	var h = convert.rgb.hsl(rgb)[0];
	var w = 1 / 255 * Math.min(r, Math.min(g, b));

	b = 1 - 1 / 255 * Math.max(r, Math.max(g, b));

	return [h, w * 100, b * 100];
};

convert.rgb.cmyk = function (rgb) {
	var r = rgb[0] / 255;
	var g = rgb[1] / 255;
	var b = rgb[2] / 255;
	var c;
	var m;
	var y;
	var k;

	k = Math.min(1 - r, 1 - g, 1 - b);
	c = (1 - r - k) / (1 - k) || 0;
	m = (1 - g - k) / (1 - k) || 0;
	y = (1 - b - k) / (1 - k) || 0;

	return [c * 100, m * 100, y * 100, k * 100];
};

convert.rgb.keyword = function (rgb) {
	return reverseKeywords[rgb.join()];
};

convert.keyword.rgb = function (keyword) {
	return cssKeywords[keyword];
};

convert.rgb.xyz = function (rgb) {
	var r = rgb[0] / 255;
	var g = rgb[1] / 255;
	var b = rgb[2] / 255;

	// assume sRGB
	r = r > 0.04045 ? Math.pow(((r + 0.055) / 1.055), 2.4) : (r / 12.92);
	g = g > 0.04045 ? Math.pow(((g + 0.055) / 1.055), 2.4) : (g / 12.92);
	b = b > 0.04045 ? Math.pow(((b + 0.055) / 1.055), 2.4) : (b / 12.92);

	var x = (r * 0.4124) + (g * 0.3576) + (b * 0.1805);
	var y = (r * 0.2126) + (g * 0.7152) + (b * 0.0722);
	var z = (r * 0.0193) + (g * 0.1192) + (b * 0.9505);

	return [x * 100, y * 100, z * 100];
};

convert.rgb.lab = function (rgb) {
	var xyz = convert.rgb.xyz(rgb);
	var x = xyz[0];
	var y = xyz[1];
	var z = xyz[2];
	var l;
	var a;
	var b;

	x /= 95.047;
	y /= 100;
	z /= 108.883;

	x = x > 0.008856 ? Math.pow(x, 1 / 3) : (7.787 * x) + (16 / 116);
	y = y > 0.008856 ? Math.pow(y, 1 / 3) : (7.787 * y) + (16 / 116);
	z = z > 0.008856 ? Math.pow(z, 1 / 3) : (7.787 * z) + (16 / 116);

	l = (116 * y) - 16;
	a = 500 * (x - y);
	b = 200 * (y - z);

	return [l, a, b];
};

convert.hsl.rgb = function (hsl) {
	var h = hsl[0] / 360;
	var s = hsl[1] / 100;
	var l = hsl[2] / 100;
	var t1;
	var t2;
	var t3;
	var rgb;
	var val;

	if (s === 0) {
		val = l * 255;
		return [val, val, val];
	}

	if (l < 0.5) {
		t2 = l * (1 + s);
	} else {
		t2 = l + s - l * s;
	}

	t1 = 2 * l - t2;

	rgb = [0, 0, 0];
	for (var i = 0; i < 3; i++) {
		t3 = h + 1 / 3 * -(i - 1);
		if (t3 < 0) {
			t3++;
		}
		if (t3 > 1) {
			t3--;
		}

		if (6 * t3 < 1) {
			val = t1 + (t2 - t1) * 6 * t3;
		} else if (2 * t3 < 1) {
			val = t2;
		} else if (3 * t3 < 2) {
			val = t1 + (t2 - t1) * (2 / 3 - t3) * 6;
		} else {
			val = t1;
		}

		rgb[i] = val * 255;
	}

	return rgb;
};

convert.hsl.hsv = function (hsl) {
	var h = hsl[0];
	var s = hsl[1] / 100;
	var l = hsl[2] / 100;
	var sv;
	var v;

	if (l === 0) {
		// no need to do calc on black
		// also avoids divide by 0 error
		return [0, 0, 0];
	}

	l *= 2;
	s *= (l <= 1) ? l : 2 - l;
	v = (l + s) / 2;
	sv = (2 * s) / (l + s);

	return [h, sv * 100, v * 100];
};

convert.hsv.rgb = function (hsv) {
	var h = hsv[0] / 60;
	var s = hsv[1] / 100;
	var v = hsv[2] / 100;
	var hi = Math.floor(h) % 6;

	var f = h - Math.floor(h);
	var p = 255 * v * (1 - s);
	var q = 255 * v * (1 - (s * f));
	var t = 255 * v * (1 - (s * (1 - f)));
	v *= 255;

	switch (hi) {
		case 0:
			return [v, t, p];
		case 1:
			return [q, v, p];
		case 2:
			return [p, v, t];
		case 3:
			return [p, q, v];
		case 4:
			return [t, p, v];
		case 5:
			return [v, p, q];
	}
};

convert.hsv.hsl = function (hsv) {
	var h = hsv[0];
	var s = hsv[1] / 100;
	var v = hsv[2] / 100;
	var sl;
	var l;

	l = (2 - s) * v;
	sl = s * v;
	sl /= (l <= 1) ? l : 2 - l;
	sl = sl || 0;
	l /= 2;

	return [h, sl * 100, l * 100];
};

// http://dev.w3.org/csswg/css-color/#hwb-to-rgb
convert.hwb.rgb = function (hwb) {
	var h = hwb[0] / 360;
	var wh = hwb[1] / 100;
	var bl = hwb[2] / 100;
	var ratio = wh + bl;
	var i;
	var v;
	var f;
	var n;

	// wh + bl cant be > 1
	if (ratio > 1) {
		wh /= ratio;
		bl /= ratio;
	}

	i = Math.floor(6 * h);
	v = 1 - bl;
	f = 6 * h - i;

	if ((i & 0x01) !== 0) {
		f = 1 - f;
	}

	n = wh + f * (v - wh); // linear interpolation

	var r;
	var g;
	var b;
	switch (i) {
		default:
		case 6:
		case 0: r = v; g = n; b = wh; break;
		case 1: r = n; g = v; b = wh; break;
		case 2: r = wh; g = v; b = n; break;
		case 3: r = wh; g = n; b = v; break;
		case 4: r = n; g = wh; b = v; break;
		case 5: r = v; g = wh; b = n; break;
	}

	return [r * 255, g * 255, b * 255];
};

convert.cmyk.rgb = function (cmyk) {
	var c = cmyk[0] / 100;
	var m = cmyk[1] / 100;
	var y = cmyk[2] / 100;
	var k = cmyk[3] / 100;
	var r;
	var g;
	var b;

	r = 1 - Math.min(1, c * (1 - k) + k);
	g = 1 - Math.min(1, m * (1 - k) + k);
	b = 1 - Math.min(1, y * (1 - k) + k);

	return [r * 255, g * 255, b * 255];
};

convert.xyz.rgb = function (xyz) {
	var x = xyz[0] / 100;
	var y = xyz[1] / 100;
	var z = xyz[2] / 100;
	var r;
	var g;
	var b;

	r = (x * 3.2406) + (y * -1.5372) + (z * -0.4986);
	g = (x * -0.9689) + (y * 1.8758) + (z * 0.0415);
	b = (x * 0.0557) + (y * -0.2040) + (z * 1.0570);

	// assume sRGB
	r = r > 0.0031308
		? ((1.055 * Math.pow(r, 1.0 / 2.4)) - 0.055)
		: r *= 12.92;

	g = g > 0.0031308
		? ((1.055 * Math.pow(g, 1.0 / 2.4)) - 0.055)
		: g *= 12.92;

	b = b > 0.0031308
		? ((1.055 * Math.pow(b, 1.0 / 2.4)) - 0.055)
		: b *= 12.92;

	r = Math.min(Math.max(0, r), 1);
	g = Math.min(Math.max(0, g), 1);
	b = Math.min(Math.max(0, b), 1);

	return [r * 255, g * 255, b * 255];
};

convert.xyz.lab = function (xyz) {
	var x = xyz[0];
	var y = xyz[1];
	var z = xyz[2];
	var l;
	var a;
	var b;

	x /= 95.047;
	y /= 100;
	z /= 108.883;

	x = x > 0.008856 ? Math.pow(x, 1 / 3) : (7.787 * x) + (16 / 116);
	y = y > 0.008856 ? Math.pow(y, 1 / 3) : (7.787 * y) + (16 / 116);
	z = z > 0.008856 ? Math.pow(z, 1 / 3) : (7.787 * z) + (16 / 116);

	l = (116 * y) - 16;
	a = 500 * (x - y);
	b = 200 * (y - z);

	return [l, a, b];
};

convert.lab.xyz = function (lab) {
	var l = lab[0];
	var a = lab[1];
	var b = lab[2];
	var x;
	var y;
	var z;
	var y2;

	if (l <= 8) {
		y = (l * 100) / 903.3;
		y2 = (7.787 * (y / 100)) + (16 / 116);
	} else {
		y = 100 * Math.pow((l + 16) / 116, 3);
		y2 = Math.pow(y / 100, 1 / 3);
	}

	x = x / 95.047 <= 0.008856
		? x = (95.047 * ((a / 500) + y2 - (16 / 116))) / 7.787
		: 95.047 * Math.pow((a / 500) + y2, 3);
	z = z / 108.883 <= 0.008859
		? z = (108.883 * (y2 - (b / 200) - (16 / 116))) / 7.787
		: 108.883 * Math.pow(y2 - (b / 200), 3);

	return [x, y, z];
};

convert.lab.lch = function (lab) {
	var l = lab[0];
	var a = lab[1];
	var b = lab[2];
	var hr;
	var h;
	var c;

	hr = Math.atan2(b, a);
	h = hr * 360 / 2 / Math.PI;

	if (h < 0) {
		h += 360;
	}

	c = Math.sqrt(a * a + b * b);

	return [l, c, h];
};

convert.lch.lab = function (lch) {
	var l = lch[0];
	var c = lch[1];
	var h = lch[2];
	var a;
	var b;
	var hr;

	hr = h / 360 * 2 * Math.PI;
	a = c * Math.cos(hr);
	b = c * Math.sin(hr);

	return [l, a, b];
};

convert.rgb.ansi16 = function (args) {
	var r = args[0];
	var g = args[1];
	var b = args[2];
	var value = 1 in arguments ? arguments[1] : convert.rgb.hsv(args)[2]; // hsv -> ansi16 optimization

	value = Math.round(value / 50);

	if (value === 0) {
		return 30;
	}

	var ansi = 30
		+ ((Math.round(b / 255) << 2)
		| (Math.round(g / 255) << 1)
		| Math.round(r / 255));

	if (value === 2) {
		ansi += 60;
	}

	return ansi;
};

convert.hsv.ansi16 = function (args) {
	// optimization here; we already know the value and don't need to get
	// it converted for us.
	return convert.rgb.ansi16(convert.hsv.rgb(args), args[2]);
};

convert.rgb.ansi256 = function (args) {
	var r = args[0];
	var g = args[1];
	var b = args[2];

	// we use the extended greyscale palette here, with the exception of
	// black and white. normal palette only has 4 greyscale shades.
	if (r === g && g === b) {
		if (r < 8) {
			return 16;
		}

		if (r > 248) {
			return 231;
		}

		return Math.round(((r - 8) / 247) * 24) + 232;
	}

	var ansi = 16
		+ (36 * Math.round(r / 255 * 5))
		+ (6 * Math.round(g / 255 * 5))
		+ Math.round(b / 255 * 5);

	return ansi;
};

convert.ansi16.rgb = function (args) {
	var color = args % 10;

	// handle greyscale
	if (color === 0 || color === 7) {
		if (args > 50) {
			color += 3.5;
		}

		color = color / 10.5 * 255;

		return [color, color, color];
	}

	var mult = (~~(args > 50) + 1) * 0.5;
	var r = ((color & 1) * mult) * 255;
	var g = (((color >> 1) & 1) * mult) * 255;
	var b = (((color >> 2) & 1) * mult) * 255;

	return [r, g, b];
};

convert.ansi256.rgb = function (args) {
	// handle greyscale
	if (args >= 232) {
		var c = (args - 232) * 10 + 8;
		return [c, c, c];
	}

	args -= 16;

	var rem;
	var r = Math.floor(args / 36) / 5 * 255;
	var g = Math.floor((rem = args % 36) / 6) / 5 * 255;
	var b = (rem % 6) / 5 * 255;

	return [r, g, b];
};

convert.rgb.hex = function (args) {
	var integer = ((Math.round(args[0]) & 0xFF) << 16)
		+ ((Math.round(args[1]) & 0xFF) << 8)
		+ (Math.round(args[2]) & 0xFF);

	var string = integer.toString(16).toUpperCase();
	return '000000'.substring(string.length) + string;
};

convert.hex.rgb = function (args) {
	var match = args.toString(16).match(/[a-f0-9]{6}/i);
	if (!match) {
		return [0, 0, 0];
	}

	var integer = parseInt(match[0], 16);
	var r = (integer >> 16) & 0xFF;
	var g = (integer >> 8) & 0xFF;
	var b = integer & 0xFF;

	return [r, g, b];
};

convert.rgb.hcg = function (rgb) {
	var r = rgb[0] / 255;
	var g = rgb[1] / 255;
	var b = rgb[2] / 255;
	var max = Math.max(Math.max(r, g), b);
	var min = Math.min(Math.min(r, g), b);
	var chroma = (max - min);
	var grayscale;
	var hue;

	if (chroma < 1) {
		grayscale = min / (1 - chroma);
	} else {
		grayscale = 0;
	}

	if (chroma <= 0) {
		hue = 0;
	} else
	if (max === r) {
		hue = ((g - b) / chroma) % 6;
	} else
	if (max === g) {
		hue = 2 + (b - r) / chroma;
	} else {
		hue = 4 + (r - g) / chroma + 4;
	}

	hue /= 6;
	hue %= 1;

	return [hue * 360, chroma * 100, grayscale * 100];
};

convert.hsl.hcg = function (hsl) {
	var s = hsl[1] / 100;
	var l = hsl[2] / 100;
	var c = 1;
	var f = 0;

	if (l < 0.5) {
		c = 2.0 * s * l;
	} else {
		c = 2.0 * s * (1.0 - l);
	}

	if (c < 1.0) {
		f = (l - 0.5 * c) / (1.0 - c);
	}

	return [hsl[0], c * 100, f * 100];
};

convert.hsv.hcg = function (hsv) {
	var s = hsv[1] / 100;
	var v = hsv[2] / 100;

	var c = s * v;
	var f = 0;

	if (c < 1.0) {
		f = (v - c) / (1 - c);
	}

	return [hsv[0], c * 100, f * 100];
};

convert.hcg.rgb = function (hcg) {
	var h = hcg[0] / 360;
	var c = hcg[1] / 100;
	var g = hcg[2] / 100;

	if (c === 0.0) {
		return [g * 255, g * 255, g * 255];
	}

	var pure = [0, 0, 0];
	var hi = (h % 1) * 6;
	var v = hi % 1;
	var w = 1 - v;
	var mg = 0;

	switch (Math.floor(hi)) {
		case 0:
			pure[0] = 1; pure[1] = v; pure[2] = 0; break;
		case 1:
			pure[0] = w; pure[1] = 1; pure[2] = 0; break;
		case 2:
			pure[0] = 0; pure[1] = 1; pure[2] = v; break;
		case 3:
			pure[0] = 0; pure[1] = w; pure[2] = 1; break;
		case 4:
			pure[0] = v; pure[1] = 0; pure[2] = 1; break;
		default:
			pure[0] = 1; pure[1] = 0; pure[2] = w;
	}

	mg = (1.0 - c) * g;

	return [
		(c * pure[0] + mg) * 255,
		(c * pure[1] + mg) * 255,
		(c * pure[2] + mg) * 255
	];
};

convert.hcg.hsv = function (hcg) {
	var c = hcg[1] / 100;
	var g = hcg[2] / 100;

	var v = c + g * (1.0 - c);
	var f = 0;

	if (v > 0.0) {
		f = c / v;
	}

	return [hcg[0], f * 100, v * 100];
};

convert.hcg.hsl = function (hcg) {
	var c = hcg[1] / 100;
	var g = hcg[2] / 100;

	var l = g * (1.0 - c) + 0.5 * c;
	var s = 0;

	if (l > 0.0 && l < 0.5) {
		s = c / (2 * l);
	} else
	if (l >= 0.5 && l < 1.0) {
		s = c / (2 * (1 - l));
	}

	return [hcg[0], s * 100, l * 100];
};

convert.hcg.hwb = function (hcg) {
	var c = hcg[1] / 100;
	var g = hcg[2] / 100;
	var v = c + g * (1.0 - c);
	return [hcg[0], (v - c) * 100, (1 - v) * 100];
};

convert.hwb.hcg = function (hwb) {
	var w = hwb[1] / 100;
	var b = hwb[2] / 100;
	var v = 1 - b;
	var c = v - w;
	var g = 0;

	if (c < 1) {
		g = (v - c) / (1 - c);
	}

	return [hwb[0], c * 100, g * 100];
};

convert.apple.rgb = function (apple) {
	return [(apple[0] / 65535) * 255, (apple[1] / 65535) * 255, (apple[2] / 65535) * 255];
};

convert.rgb.apple = function (rgb) {
	return [(rgb[0] / 255) * 65535, (rgb[1] / 255) * 65535, (rgb[2] / 255) * 65535];
};

},{"./css-keywords":102}],102:[function(require,module,exports){
module.exports = {
	aliceblue: [240, 248, 255],
	antiquewhite: [250, 235, 215],
	aqua: [0, 255, 255],
	aquamarine: [127, 255, 212],
	azure: [240, 255, 255],
	beige: [245, 245, 220],
	bisque: [255, 228, 196],
	black: [0, 0, 0],
	blanchedalmond: [255, 235, 205],
	blue: [0, 0, 255],
	blueviolet: [138, 43, 226],
	brown: [165, 42, 42],
	burlywood: [222, 184, 135],
	cadetblue: [95, 158, 160],
	chartreuse: [127, 255, 0],
	chocolate: [210, 105, 30],
	coral: [255, 127, 80],
	cornflowerblue: [100, 149, 237],
	cornsilk: [255, 248, 220],
	crimson: [220, 20, 60],
	cyan: [0, 255, 255],
	darkblue: [0, 0, 139],
	darkcyan: [0, 139, 139],
	darkgoldenrod: [184, 134, 11],
	darkgray: [169, 169, 169],
	darkgreen: [0, 100, 0],
	darkgrey: [169, 169, 169],
	darkkhaki: [189, 183, 107],
	darkmagenta: [139, 0, 139],
	darkolivegreen: [85, 107, 47],
	darkorange: [255, 140, 0],
	darkorchid: [153, 50, 204],
	darkred: [139, 0, 0],
	darksalmon: [233, 150, 122],
	darkseagreen: [143, 188, 143],
	darkslateblue: [72, 61, 139],
	darkslategray: [47, 79, 79],
	darkslategrey: [47, 79, 79],
	darkturquoise: [0, 206, 209],
	darkviolet: [148, 0, 211],
	deeppink: [255, 20, 147],
	deepskyblue: [0, 191, 255],
	dimgray: [105, 105, 105],
	dimgrey: [105, 105, 105],
	dodgerblue: [30, 144, 255],
	firebrick: [178, 34, 34],
	floralwhite: [255, 250, 240],
	forestgreen: [34, 139, 34],
	fuchsia: [255, 0, 255],
	gainsboro: [220, 220, 220],
	ghostwhite: [248, 248, 255],
	gold: [255, 215, 0],
	goldenrod: [218, 165, 32],
	gray: [128, 128, 128],
	green: [0, 128, 0],
	greenyellow: [173, 255, 47],
	grey: [128, 128, 128],
	honeydew: [240, 255, 240],
	hotpink: [255, 105, 180],
	indianred: [205, 92, 92],
	indigo: [75, 0, 130],
	ivory: [255, 255, 240],
	khaki: [240, 230, 140],
	lavender: [230, 230, 250],
	lavenderblush: [255, 240, 245],
	lawngreen: [124, 252, 0],
	lemonchiffon: [255, 250, 205],
	lightblue: [173, 216, 230],
	lightcoral: [240, 128, 128],
	lightcyan: [224, 255, 255],
	lightgoldenrodyellow: [250, 250, 210],
	lightgray: [211, 211, 211],
	lightgreen: [144, 238, 144],
	lightgrey: [211, 211, 211],
	lightpink: [255, 182, 193],
	lightsalmon: [255, 160, 122],
	lightseagreen: [32, 178, 170],
	lightskyblue: [135, 206, 250],
	lightslategray: [119, 136, 153],
	lightslategrey: [119, 136, 153],
	lightsteelblue: [176, 196, 222],
	lightyellow: [255, 255, 224],
	lime: [0, 255, 0],
	limegreen: [50, 205, 50],
	linen: [250, 240, 230],
	magenta: [255, 0, 255],
	maroon: [128, 0, 0],
	mediumaquamarine: [102, 205, 170],
	mediumblue: [0, 0, 205],
	mediumorchid: [186, 85, 211],
	mediumpurple: [147, 112, 219],
	mediumseagreen: [60, 179, 113],
	mediumslateblue: [123, 104, 238],
	mediumspringgreen: [0, 250, 154],
	mediumturquoise: [72, 209, 204],
	mediumvioletred: [199, 21, 133],
	midnightblue: [25, 25, 112],
	mintcream: [245, 255, 250],
	mistyrose: [255, 228, 225],
	moccasin: [255, 228, 181],
	navajowhite: [255, 222, 173],
	navy: [0, 0, 128],
	oldlace: [253, 245, 230],
	olive: [128, 128, 0],
	olivedrab: [107, 142, 35],
	orange: [255, 165, 0],
	orangered: [255, 69, 0],
	orchid: [218, 112, 214],
	palegoldenrod: [238, 232, 170],
	palegreen: [152, 251, 152],
	paleturquoise: [175, 238, 238],
	palevioletred: [219, 112, 147],
	papayawhip: [255, 239, 213],
	peachpuff: [255, 218, 185],
	peru: [205, 133, 63],
	pink: [255, 192, 203],
	plum: [221, 160, 221],
	powderblue: [176, 224, 230],
	purple: [128, 0, 128],
	rebeccapurple: [102, 51, 153],
	red: [255, 0, 0],
	rosybrown: [188, 143, 143],
	royalblue: [65, 105, 225],
	saddlebrown: [139, 69, 19],
	salmon: [250, 128, 114],
	sandybrown: [244, 164, 96],
	seagreen: [46, 139, 87],
	seashell: [255, 245, 238],
	sienna: [160, 82, 45],
	silver: [192, 192, 192],
	skyblue: [135, 206, 235],
	slateblue: [106, 90, 205],
	slategray: [112, 128, 144],
	slategrey: [112, 128, 144],
	snow: [255, 250, 250],
	springgreen: [0, 255, 127],
	steelblue: [70, 130, 180],
	tan: [210, 180, 140],
	teal: [0, 128, 128],
	thistle: [216, 191, 216],
	tomato: [255, 99, 71],
	turquoise: [64, 224, 208],
	violet: [238, 130, 238],
	wheat: [245, 222, 179],
	white: [255, 255, 255],
	whitesmoke: [245, 245, 245],
	yellow: [255, 255, 0],
	yellowgreen: [154, 205, 50]
};


},{}],103:[function(require,module,exports){
var conversions = require('./conversions');
var route = require('./route');

var convert = {};

var models = Object.keys(conversions);

function wrapRaw(fn) {
	var wrappedFn = function (args) {
		if (args === undefined || args === null) {
			return args;
		}

		if (arguments.length > 1) {
			args = Array.prototype.slice.call(arguments);
		}

		return fn(args);
	};

	// preserve .conversion property if there is one
	if ('conversion' in fn) {
		wrappedFn.conversion = fn.conversion;
	}

	return wrappedFn;
}

function wrapRounded(fn) {
	var wrappedFn = function (args) {
		if (args === undefined || args === null) {
			return args;
		}

		if (arguments.length > 1) {
			args = Array.prototype.slice.call(arguments);
		}

		var result = fn(args);

		// we're assuming the result is an array here.
		// see notice in conversions.js; don't use box types
		// in conversion functions.
		if (typeof result === 'object') {
			for (var len = result.length, i = 0; i < len; i++) {
				result[i] = Math.round(result[i]);
			}
		}

		return result;
	};

	// preserve .conversion property if there is one
	if ('conversion' in fn) {
		wrappedFn.conversion = fn.conversion;
	}

	return wrappedFn;
}

models.forEach(function (fromModel) {
	convert[fromModel] = {};

	Object.defineProperty(convert[fromModel], 'channels', {value: conversions[fromModel].channels});

	var routes = route(fromModel);
	var routeModels = Object.keys(routes);

	routeModels.forEach(function (toModel) {
		var fn = routes[toModel];

		convert[fromModel][toModel] = wrapRounded(fn);
		convert[fromModel][toModel].raw = wrapRaw(fn);
	});
});

module.exports = convert;

},{"./conversions":101,"./route":104}],104:[function(require,module,exports){
var conversions = require('./conversions');

/*
	this function routes a model to all other models.

	all functions that are routed have a property `.conversion` attached
	to the returned synthetic function. This property is an array
	of strings, each with the steps in between the 'from' and 'to'
	color models (inclusive).

	conversions that are not possible simply are not included.
*/

// https://jsperf.com/object-keys-vs-for-in-with-closure/3
var models = Object.keys(conversions);

function buildGraph() {
	var graph = {};

	for (var len = models.length, i = 0; i < len; i++) {
		graph[models[i]] = {
			// http://jsperf.com/1-vs-infinity
			// micro-opt, but this is simple.
			distance: -1,
			parent: null
		};
	}

	return graph;
}

// https://en.wikipedia.org/wiki/Breadth-first_search
function deriveBFS(fromModel) {
	var graph = buildGraph();
	var queue = [fromModel]; // unshift -> queue -> pop

	graph[fromModel].distance = 0;

	while (queue.length) {
		var current = queue.pop();
		var adjacents = Object.keys(conversions[current]);

		for (var len = adjacents.length, i = 0; i < len; i++) {
			var adjacent = adjacents[i];
			var node = graph[adjacent];

			if (node.distance === -1) {
				node.distance = graph[current].distance + 1;
				node.parent = current;
				queue.unshift(adjacent);
			}
		}
	}

	return graph;
}

function link(from, to) {
	return function (args) {
		return to(from(args));
	};
}

function wrapConversion(toModel, graph) {
	var path = [graph[toModel].parent, toModel];
	var fn = conversions[graph[toModel].parent][toModel];

	var cur = graph[toModel].parent;
	while (graph[cur].parent) {
		path.unshift(graph[cur].parent);
		fn = link(conversions[graph[cur].parent][cur], fn);
		cur = graph[cur].parent;
	}

	fn.conversion = path;
	return fn;
}

module.exports = function (fromModel) {
	var graph = deriveBFS(fromModel);
	var conversion = {};

	var models = Object.keys(graph);
	for (var len = models.length, i = 0; i < len; i++) {
		var toModel = models[i];
		var node = graph[toModel];

		if (node.parent === null) {
			// no possible conversion, or this node is the source model.
			continue;
		}

		conversion[toModel] = wrapConversion(toModel, graph);
	}

	return conversion;
};


},{"./conversions":101}],105:[function(require,module,exports){
module.exports = {
	"aliceblue": [240, 248, 255],
	"antiquewhite": [250, 235, 215],
	"aqua": [0, 255, 255],
	"aquamarine": [127, 255, 212],
	"azure": [240, 255, 255],
	"beige": [245, 245, 220],
	"bisque": [255, 228, 196],
	"black": [0, 0, 0],
	"blanchedalmond": [255, 235, 205],
	"blue": [0, 0, 255],
	"blueviolet": [138, 43, 226],
	"brown": [165, 42, 42],
	"burlywood": [222, 184, 135],
	"cadetblue": [95, 158, 160],
	"chartreuse": [127, 255, 0],
	"chocolate": [210, 105, 30],
	"coral": [255, 127, 80],
	"cornflowerblue": [100, 149, 237],
	"cornsilk": [255, 248, 220],
	"crimson": [220, 20, 60],
	"cyan": [0, 255, 255],
	"darkblue": [0, 0, 139],
	"darkcyan": [0, 139, 139],
	"darkgoldenrod": [184, 134, 11],
	"darkgray": [169, 169, 169],
	"darkgreen": [0, 100, 0],
	"darkgrey": [169, 169, 169],
	"darkkhaki": [189, 183, 107],
	"darkmagenta": [139, 0, 139],
	"darkolivegreen": [85, 107, 47],
	"darkorange": [255, 140, 0],
	"darkorchid": [153, 50, 204],
	"darkred": [139, 0, 0],
	"darksalmon": [233, 150, 122],
	"darkseagreen": [143, 188, 143],
	"darkslateblue": [72, 61, 139],
	"darkslategray": [47, 79, 79],
	"darkslategrey": [47, 79, 79],
	"darkturquoise": [0, 206, 209],
	"darkviolet": [148, 0, 211],
	"deeppink": [255, 20, 147],
	"deepskyblue": [0, 191, 255],
	"dimgray": [105, 105, 105],
	"dimgrey": [105, 105, 105],
	"dodgerblue": [30, 144, 255],
	"firebrick": [178, 34, 34],
	"floralwhite": [255, 250, 240],
	"forestgreen": [34, 139, 34],
	"fuchsia": [255, 0, 255],
	"gainsboro": [220, 220, 220],
	"ghostwhite": [248, 248, 255],
	"gold": [255, 215, 0],
	"goldenrod": [218, 165, 32],
	"gray": [128, 128, 128],
	"green": [0, 128, 0],
	"greenyellow": [173, 255, 47],
	"grey": [128, 128, 128],
	"honeydew": [240, 255, 240],
	"hotpink": [255, 105, 180],
	"indianred": [205, 92, 92],
	"indigo": [75, 0, 130],
	"ivory": [255, 255, 240],
	"khaki": [240, 230, 140],
	"lavender": [230, 230, 250],
	"lavenderblush": [255, 240, 245],
	"lawngreen": [124, 252, 0],
	"lemonchiffon": [255, 250, 205],
	"lightblue": [173, 216, 230],
	"lightcoral": [240, 128, 128],
	"lightcyan": [224, 255, 255],
	"lightgoldenrodyellow": [250, 250, 210],
	"lightgray": [211, 211, 211],
	"lightgreen": [144, 238, 144],
	"lightgrey": [211, 211, 211],
	"lightpink": [255, 182, 193],
	"lightsalmon": [255, 160, 122],
	"lightseagreen": [32, 178, 170],
	"lightskyblue": [135, 206, 250],
	"lightslategray": [119, 136, 153],
	"lightslategrey": [119, 136, 153],
	"lightsteelblue": [176, 196, 222],
	"lightyellow": [255, 255, 224],
	"lime": [0, 255, 0],
	"limegreen": [50, 205, 50],
	"linen": [250, 240, 230],
	"magenta": [255, 0, 255],
	"maroon": [128, 0, 0],
	"mediumaquamarine": [102, 205, 170],
	"mediumblue": [0, 0, 205],
	"mediumorchid": [186, 85, 211],
	"mediumpurple": [147, 112, 219],
	"mediumseagreen": [60, 179, 113],
	"mediumslateblue": [123, 104, 238],
	"mediumspringgreen": [0, 250, 154],
	"mediumturquoise": [72, 209, 204],
	"mediumvioletred": [199, 21, 133],
	"midnightblue": [25, 25, 112],
	"mintcream": [245, 255, 250],
	"mistyrose": [255, 228, 225],
	"moccasin": [255, 228, 181],
	"navajowhite": [255, 222, 173],
	"navy": [0, 0, 128],
	"oldlace": [253, 245, 230],
	"olive": [128, 128, 0],
	"olivedrab": [107, 142, 35],
	"orange": [255, 165, 0],
	"orangered": [255, 69, 0],
	"orchid": [218, 112, 214],
	"palegoldenrod": [238, 232, 170],
	"palegreen": [152, 251, 152],
	"paleturquoise": [175, 238, 238],
	"palevioletred": [219, 112, 147],
	"papayawhip": [255, 239, 213],
	"peachpuff": [255, 218, 185],
	"peru": [205, 133, 63],
	"pink": [255, 192, 203],
	"plum": [221, 160, 221],
	"powderblue": [176, 224, 230],
	"purple": [128, 0, 128],
	"rebeccapurple": [102, 51, 153],
	"red": [255, 0, 0],
	"rosybrown": [188, 143, 143],
	"royalblue": [65, 105, 225],
	"saddlebrown": [139, 69, 19],
	"salmon": [250, 128, 114],
	"sandybrown": [244, 164, 96],
	"seagreen": [46, 139, 87],
	"seashell": [255, 245, 238],
	"sienna": [160, 82, 45],
	"silver": [192, 192, 192],
	"skyblue": [135, 206, 235],
	"slateblue": [106, 90, 205],
	"slategray": [112, 128, 144],
	"slategrey": [112, 128, 144],
	"snow": [255, 250, 250],
	"springgreen": [0, 255, 127],
	"steelblue": [70, 130, 180],
	"tan": [210, 180, 140],
	"teal": [0, 128, 128],
	"thistle": [216, 191, 216],
	"tomato": [255, 99, 71],
	"turquoise": [64, 224, 208],
	"violet": [238, 130, 238],
	"wheat": [245, 222, 179],
	"white": [255, 255, 255],
	"whitesmoke": [245, 245, 245],
	"yellow": [255, 255, 0],
	"yellowgreen": [154, 205, 50]
};
},{}],106:[function(require,module,exports){
/* MIT license */
var colorNames = require('color-name');

module.exports = {
   getRgba: getRgba,
   getHsla: getHsla,
   getRgb: getRgb,
   getHsl: getHsl,
   getHwb: getHwb,
   getAlpha: getAlpha,

   hexString: hexString,
   rgbString: rgbString,
   rgbaString: rgbaString,
   percentString: percentString,
   percentaString: percentaString,
   hslString: hslString,
   hslaString: hslaString,
   hwbString: hwbString,
   keyword: keyword
}

function getRgba(string) {
   if (!string) {
      return;
   }
   var abbr =  /^#([a-fA-F0-9]{3})$/,
       hex =  /^#([a-fA-F0-9]{6})$/,
       rgba = /^rgba?\(\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*(?:,\s*([+-]?[\d\.]+)\s*)?\)$/,
       per = /^rgba?\(\s*([+-]?[\d\.]+)\%\s*,\s*([+-]?[\d\.]+)\%\s*,\s*([+-]?[\d\.]+)\%\s*(?:,\s*([+-]?[\d\.]+)\s*)?\)$/,
       keyword = /(\D+)/;

   var rgb = [0, 0, 0],
       a = 1,
       match = string.match(abbr);
   if (match) {
      match = match[1];
      for (var i = 0; i < rgb.length; i++) {
         rgb[i] = parseInt(match[i] + match[i], 16);
      }
   }
   else if (match = string.match(hex)) {
      match = match[1];
      for (var i = 0; i < rgb.length; i++) {
         rgb[i] = parseInt(match.slice(i * 2, i * 2 + 2), 16);
      }
   }
   else if (match = string.match(rgba)) {
      for (var i = 0; i < rgb.length; i++) {
         rgb[i] = parseInt(match[i + 1]);
      }
      a = parseFloat(match[4]);
   }
   else if (match = string.match(per)) {
      for (var i = 0; i < rgb.length; i++) {
         rgb[i] = Math.round(parseFloat(match[i + 1]) * 2.55);
      }
      a = parseFloat(match[4]);
   }
   else if (match = string.match(keyword)) {
      if (match[1] == "transparent") {
         return [0, 0, 0, 0];
      }
      rgb = colorNames[match[1]];
      if (!rgb) {
         return;
      }
   }

   for (var i = 0; i < rgb.length; i++) {
      rgb[i] = scale(rgb[i], 0, 255);
   }
   if (!a && a != 0) {
      a = 1;
   }
   else {
      a = scale(a, 0, 1);
   }
   rgb[3] = a;
   return rgb;
}

function getHsla(string) {
   if (!string) {
      return;
   }
   var hsl = /^hsla?\(\s*([+-]?\d+)(?:deg)?\s*,\s*([+-]?[\d\.]+)%\s*,\s*([+-]?[\d\.]+)%\s*(?:,\s*([+-]?[\d\.]+)\s*)?\)/;
   var match = string.match(hsl);
   if (match) {
      var alpha = parseFloat(match[4]);
      var h = scale(parseInt(match[1]), 0, 360),
          s = scale(parseFloat(match[2]), 0, 100),
          l = scale(parseFloat(match[3]), 0, 100),
          a = scale(isNaN(alpha) ? 1 : alpha, 0, 1);
      return [h, s, l, a];
   }
}

function getHwb(string) {
   if (!string) {
      return;
   }
   var hwb = /^hwb\(\s*([+-]?\d+)(?:deg)?\s*,\s*([+-]?[\d\.]+)%\s*,\s*([+-]?[\d\.]+)%\s*(?:,\s*([+-]?[\d\.]+)\s*)?\)/;
   var match = string.match(hwb);
   if (match) {
    var alpha = parseFloat(match[4]);
      var h = scale(parseInt(match[1]), 0, 360),
          w = scale(parseFloat(match[2]), 0, 100),
          b = scale(parseFloat(match[3]), 0, 100),
          a = scale(isNaN(alpha) ? 1 : alpha, 0, 1);
      return [h, w, b, a];
   }
}

function getRgb(string) {
   var rgba = getRgba(string);
   return rgba && rgba.slice(0, 3);
}

function getHsl(string) {
  var hsla = getHsla(string);
  return hsla && hsla.slice(0, 3);
}

function getAlpha(string) {
   var vals = getRgba(string);
   if (vals) {
      return vals[3];
   }
   else if (vals = getHsla(string)) {
      return vals[3];
   }
   else if (vals = getHwb(string)) {
      return vals[3];
   }
}

// generators
function hexString(rgb) {
   return "#" + hexDouble(rgb[0]) + hexDouble(rgb[1])
              + hexDouble(rgb[2]);
}

function rgbString(rgba, alpha) {
   if (alpha < 1 || (rgba[3] && rgba[3] < 1)) {
      return rgbaString(rgba, alpha);
   }
   return "rgb(" + rgba[0] + ", " + rgba[1] + ", " + rgba[2] + ")";
}

function rgbaString(rgba, alpha) {
   if (alpha === undefined) {
      alpha = (rgba[3] !== undefined ? rgba[3] : 1);
   }
   return "rgba(" + rgba[0] + ", " + rgba[1] + ", " + rgba[2]
           + ", " + alpha + ")";
}

function percentString(rgba, alpha) {
   if (alpha < 1 || (rgba[3] && rgba[3] < 1)) {
      return percentaString(rgba, alpha);
   }
   var r = Math.round(rgba[0]/255 * 100),
       g = Math.round(rgba[1]/255 * 100),
       b = Math.round(rgba[2]/255 * 100);

   return "rgb(" + r + "%, " + g + "%, " + b + "%)";
}

function percentaString(rgba, alpha) {
   var r = Math.round(rgba[0]/255 * 100),
       g = Math.round(rgba[1]/255 * 100),
       b = Math.round(rgba[2]/255 * 100);
   return "rgba(" + r + "%, " + g + "%, " + b + "%, " + (alpha || rgba[3] || 1) + ")";
}

function hslString(hsla, alpha) {
   if (alpha < 1 || (hsla[3] && hsla[3] < 1)) {
      return hslaString(hsla, alpha);
   }
   return "hsl(" + hsla[0] + ", " + hsla[1] + "%, " + hsla[2] + "%)";
}

function hslaString(hsla, alpha) {
   if (alpha === undefined) {
      alpha = (hsla[3] !== undefined ? hsla[3] : 1);
   }
   return "hsla(" + hsla[0] + ", " + hsla[1] + "%, " + hsla[2] + "%, "
           + alpha + ")";
}

// hwb is a bit different than rgb(a) & hsl(a) since there is no alpha specific syntax
// (hwb have alpha optional & 1 is default value)
function hwbString(hwb, alpha) {
   if (alpha === undefined) {
      alpha = (hwb[3] !== undefined ? hwb[3] : 1);
   }
   return "hwb(" + hwb[0] + ", " + hwb[1] + "%, " + hwb[2] + "%"
           + (alpha !== undefined && alpha !== 1 ? ", " + alpha : "") + ")";
}

function keyword(rgb) {
  return reverseNames[rgb.slice(0, 3)];
}

// helpers
function scale(num, min, max) {
   return Math.min(Math.max(min, num), max);
}

function hexDouble(num) {
  var str = num.toString(16).toUpperCase();
  return (str.length < 2) ? "0" + str : str;
}


//create a list of reverse color names
var reverseNames = {};
for (var name in colorNames) {
   reverseNames[colorNames[name]] = name;
}

},{"color-name":105}],107:[function(require,module,exports){
/* MIT license */
var clone = require('clone');
var convert = require('color-convert');
var string = require('color-string');

var Color = function (obj) {
	if (obj instanceof Color) {
		return obj;
	}
	if (!(this instanceof Color)) {
		return new Color(obj);
	}

	this.values = {
		rgb: [0, 0, 0],
		hsl: [0, 0, 0],
		hsv: [0, 0, 0],
		hwb: [0, 0, 0],
		cmyk: [0, 0, 0, 0],
		alpha: 1
	};

	// parse Color() argument
	var vals;
	if (typeof obj === 'string') {
		vals = string.getRgba(obj);
		if (vals) {
			this.setValues('rgb', vals);
		} else if (vals = string.getHsla(obj)) {
			this.setValues('hsl', vals);
		} else if (vals = string.getHwb(obj)) {
			this.setValues('hwb', vals);
		} else {
			throw new Error('Unable to parse color from string "' + obj + '"');
		}
	} else if (typeof obj === 'object') {
		vals = obj;
		if (vals.r !== undefined || vals.red !== undefined) {
			this.setValues('rgb', vals);
		} else if (vals.l !== undefined || vals.lightness !== undefined) {
			this.setValues('hsl', vals);
		} else if (vals.v !== undefined || vals.value !== undefined) {
			this.setValues('hsv', vals);
		} else if (vals.w !== undefined || vals.whiteness !== undefined) {
			this.setValues('hwb', vals);
		} else if (vals.c !== undefined || vals.cyan !== undefined) {
			this.setValues('cmyk', vals);
		} else {
			throw new Error('Unable to parse color from object ' + JSON.stringify(obj));
		}
	}
};

Color.prototype = {
	rgb: function () {
		return this.setSpace('rgb', arguments);
	},
	hsl: function () {
		return this.setSpace('hsl', arguments);
	},
	hsv: function () {
		return this.setSpace('hsv', arguments);
	},
	hwb: function () {
		return this.setSpace('hwb', arguments);
	},
	cmyk: function () {
		return this.setSpace('cmyk', arguments);
	},

	rgbArray: function () {
		return this.values.rgb;
	},
	hslArray: function () {
		return this.values.hsl;
	},
	hsvArray: function () {
		return this.values.hsv;
	},
	hwbArray: function () {
		if (this.values.alpha !== 1) {
			return this.values.hwb.concat([this.values.alpha]);
		}
		return this.values.hwb;
	},
	cmykArray: function () {
		return this.values.cmyk;
	},
	rgbaArray: function () {
		var rgb = this.values.rgb;
		return rgb.concat([this.values.alpha]);
	},
	hslaArray: function () {
		var hsl = this.values.hsl;
		return hsl.concat([this.values.alpha]);
	},
	alpha: function (val) {
		if (val === undefined) {
			return this.values.alpha;
		}
		this.setValues('alpha', val);
		return this;
	},

	red: function (val) {
		return this.setChannel('rgb', 0, val);
	},
	green: function (val) {
		return this.setChannel('rgb', 1, val);
	},
	blue: function (val) {
		return this.setChannel('rgb', 2, val);
	},
	hue: function (val) {
		if (val) {
			val %= 360;
			val = val < 0 ? 360 + val : val;
		}
		return this.setChannel('hsl', 0, val);
	},
	saturation: function (val) {
		return this.setChannel('hsl', 1, val);
	},
	lightness: function (val) {
		return this.setChannel('hsl', 2, val);
	},
	saturationv: function (val) {
		return this.setChannel('hsv', 1, val);
	},
	whiteness: function (val) {
		return this.setChannel('hwb', 1, val);
	},
	blackness: function (val) {
		return this.setChannel('hwb', 2, val);
	},
	value: function (val) {
		return this.setChannel('hsv', 2, val);
	},
	cyan: function (val) {
		return this.setChannel('cmyk', 0, val);
	},
	magenta: function (val) {
		return this.setChannel('cmyk', 1, val);
	},
	yellow: function (val) {
		return this.setChannel('cmyk', 2, val);
	},
	black: function (val) {
		return this.setChannel('cmyk', 3, val);
	},

	hexString: function () {
		return string.hexString(this.values.rgb);
	},
	rgbString: function () {
		return string.rgbString(this.values.rgb, this.values.alpha);
	},
	rgbaString: function () {
		return string.rgbaString(this.values.rgb, this.values.alpha);
	},
	percentString: function () {
		return string.percentString(this.values.rgb, this.values.alpha);
	},
	hslString: function () {
		return string.hslString(this.values.hsl, this.values.alpha);
	},
	hslaString: function () {
		return string.hslaString(this.values.hsl, this.values.alpha);
	},
	hwbString: function () {
		return string.hwbString(this.values.hwb, this.values.alpha);
	},
	keyword: function () {
		return string.keyword(this.values.rgb, this.values.alpha);
	},

	rgbNumber: function () {
		return (this.values.rgb[0] << 16) | (this.values.rgb[1] << 8) | this.values.rgb[2];
	},

	luminosity: function () {
		// http://www.w3.org/TR/WCAG20/#relativeluminancedef
		var rgb = this.values.rgb;
		var lum = [];
		for (var i = 0; i < rgb.length; i++) {
			var chan = rgb[i] / 255;
			lum[i] = (chan <= 0.03928) ? chan / 12.92 : Math.pow(((chan + 0.055) / 1.055), 2.4);
		}
		return 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
	},

	contrast: function (color2) {
		// http://www.w3.org/TR/WCAG20/#contrast-ratiodef
		var lum1 = this.luminosity();
		var lum2 = color2.luminosity();
		if (lum1 > lum2) {
			return (lum1 + 0.05) / (lum2 + 0.05);
		}
		return (lum2 + 0.05) / (lum1 + 0.05);
	},

	level: function (color2) {
		var contrastRatio = this.contrast(color2);
		if (contrastRatio >= 7.1) {
			return 'AAA';
		}

		return (contrastRatio >= 4.5) ? 'AA' : '';
	},

	dark: function () {
		// YIQ equation from http://24ways.org/2010/calculating-color-contrast
		var rgb = this.values.rgb;
		var yiq = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
		return yiq < 128;
	},

	light: function () {
		return !this.dark();
	},

	negate: function () {
		var rgb = [];
		for (var i = 0; i < 3; i++) {
			rgb[i] = 255 - this.values.rgb[i];
		}
		this.setValues('rgb', rgb);
		return this;
	},

	lighten: function (ratio) {
		this.values.hsl[2] += this.values.hsl[2] * ratio;
		this.setValues('hsl', this.values.hsl);
		return this;
	},

	darken: function (ratio) {
		this.values.hsl[2] -= this.values.hsl[2] * ratio;
		this.setValues('hsl', this.values.hsl);
		return this;
	},

	saturate: function (ratio) {
		this.values.hsl[1] += this.values.hsl[1] * ratio;
		this.setValues('hsl', this.values.hsl);
		return this;
	},

	desaturate: function (ratio) {
		this.values.hsl[1] -= this.values.hsl[1] * ratio;
		this.setValues('hsl', this.values.hsl);
		return this;
	},

	whiten: function (ratio) {
		this.values.hwb[1] += this.values.hwb[1] * ratio;
		this.setValues('hwb', this.values.hwb);
		return this;
	},

	blacken: function (ratio) {
		this.values.hwb[2] += this.values.hwb[2] * ratio;
		this.setValues('hwb', this.values.hwb);
		return this;
	},

	greyscale: function () {
		var rgb = this.values.rgb;
		// http://en.wikipedia.org/wiki/Grayscale#Converting_color_to_grayscale
		var val = rgb[0] * 0.3 + rgb[1] * 0.59 + rgb[2] * 0.11;
		this.setValues('rgb', [val, val, val]);
		return this;
	},

	clearer: function (ratio) {
		this.setValues('alpha', this.values.alpha - (this.values.alpha * ratio));
		return this;
	},

	opaquer: function (ratio) {
		this.setValues('alpha', this.values.alpha + (this.values.alpha * ratio));
		return this;
	},

	rotate: function (degrees) {
		var hue = this.values.hsl[0];
		hue = (hue + degrees) % 360;
		hue = hue < 0 ? 360 + hue : hue;
		this.values.hsl[0] = hue;
		this.setValues('hsl', this.values.hsl);
		return this;
	},

	/**
	 * Ported from sass implementation in C
	 * https://github.com/sass/libsass/blob/0e6b4a2850092356aa3ece07c6b249f0221caced/functions.cpp#L209
	 */
	mix: function (mixinColor, weight) {
		var color1 = this;
		var color2 = mixinColor;
		var p = weight === undefined ? 0.5 : weight;

		var w = 2 * p - 1;
		var a = color1.alpha() - color2.alpha();

		var w1 = (((w * a === -1) ? w : (w + a) / (1 + w * a)) + 1) / 2.0;
		var w2 = 1 - w1;

		return this
			.rgb(
				w1 * color1.red() + w2 * color2.red(),
				w1 * color1.green() + w2 * color2.green(),
				w1 * color1.blue() + w2 * color2.blue()
			)
			.alpha(color1.alpha() * p + color2.alpha() * (1 - p));
	},

	toJSON: function () {
		return this.rgb();
	},

	clone: function () {
		var col = new Color();
		col.values = clone(this.values);
		return col;
	}
};

Color.prototype.getValues = function (space) {
	var vals = {};

	for (var i = 0; i < space.length; i++) {
		vals[space.charAt(i)] = this.values[space][i];
	}

	if (this.values.alpha !== 1) {
		vals.a = this.values.alpha;
	}

	// {r: 255, g: 255, b: 255, a: 0.4}
	return vals;
};

Color.prototype.setValues = function (space, vals) {
	var spaces = {
		rgb: ['red', 'green', 'blue'],
		hsl: ['hue', 'saturation', 'lightness'],
		hsv: ['hue', 'saturation', 'value'],
		hwb: ['hue', 'whiteness', 'blackness'],
		cmyk: ['cyan', 'magenta', 'yellow', 'black']
	};

	var maxes = {
		rgb: [255, 255, 255],
		hsl: [360, 100, 100],
		hsv: [360, 100, 100],
		hwb: [360, 100, 100],
		cmyk: [100, 100, 100, 100]
	};

	var i;
	var alpha = 1;
	if (space === 'alpha') {
		alpha = vals;
	} else if (vals.length) {
		// [10, 10, 10]
		this.values[space] = vals.slice(0, space.length);
		alpha = vals[space.length];
	} else if (vals[space.charAt(0)] !== undefined) {
		// {r: 10, g: 10, b: 10}
		for (i = 0; i < space.length; i++) {
			this.values[space][i] = vals[space.charAt(i)];
		}

		alpha = vals.a;
	} else if (vals[spaces[space][0]] !== undefined) {
		// {red: 10, green: 10, blue: 10}
		var chans = spaces[space];

		for (i = 0; i < space.length; i++) {
			this.values[space][i] = vals[chans[i]];
		}

		alpha = vals.alpha;
	}

	this.values.alpha = Math.max(0, Math.min(1, (alpha === undefined ? this.values.alpha : alpha)));

	if (space === 'alpha') {
		return false;
	}

	var capped;

	// cap values of the space prior converting all values
	for (i = 0; i < space.length; i++) {
		capped = Math.max(0, Math.min(maxes[space][i], this.values[space][i]));
		this.values[space][i] = Math.round(capped);
	}

	// convert to all the other color spaces
	for (var sname in spaces) {
		if (sname !== space) {
			this.values[sname] = convert[space][sname](this.values[space]);
		}

		// cap values
		for (i = 0; i < sname.length; i++) {
			capped = Math.max(0, Math.min(maxes[sname][i], this.values[sname][i]));
			this.values[sname][i] = Math.round(capped);
		}
	}

	return true;
};

Color.prototype.setSpace = function (space, args) {
	var vals = args[0];

	if (vals === undefined) {
		// color.rgb()
		return this.getValues(space);
	}

	// color.rgb(10, 10, 10)
	if (typeof vals === 'number') {
		vals = Array.prototype.slice.call(args);
	}

	this.setValues(space, vals);
	return this;
};

Color.prototype.setChannel = function (space, index, val) {
	if (val === undefined) {
		// color.red()
		return this.values[space][index];
	} else if (val === this.values[space][index]) {
		// color.red(color.red())
		return this;
	}

	// color.red(100)
	this.values[space][index] = val;
	this.setValues(space, this.values[space]);

	return this;
};

module.exports = Color;

},{"clone":100,"color-convert":103,"color-string":106}],108:[function(require,module,exports){
/**
 * toString ref.
 */

var toString = Object.prototype.toString;

/**
 * Return the type of `val`.
 *
 * @param {Mixed} val
 * @return {String}
 * @api public
 */

module.exports = function(val){
  switch (toString.call(val)) {
    case '[object Date]': return 'date';
    case '[object RegExp]': return 'regexp';
    case '[object Arguments]': return 'arguments';
    case '[object Array]': return 'array';
    case '[object Error]': return 'error';
  }

  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (val !== val) return 'nan';
  if (val && val.nodeType === 1) return 'element';

  if (isBuffer(val)) return 'buffer';

  val = val.valueOf
    ? val.valueOf()
    : Object.prototype.valueOf.apply(val);

  return typeof val;
};

// code borrowed from https://github.com/feross/is-buffer/blob/master/index.js
function isBuffer(obj) {
  return !!(obj != null &&
    (obj._isBuffer || // For Safari 5-7 (missing Object.prototype.constructor)
      (obj.constructor &&
      typeof obj.constructor.isBuffer === 'function' &&
      obj.constructor.isBuffer(obj))
    ))
}

},{}],109:[function(require,module,exports){
(function (Buffer){
'use strict';
var fs = require('fs');
var path = require('path');

var commentRx = /^[ \t]*(?:\/\/|\/\*)[@#][ \t]+sourceMappingURL=data:(?:application|text)\/json;base64,(.+)(?:\*\/)?/mg;
var mapFileCommentRx =
  // //# sourceMappingURL=foo.js.map                       
  /(?:^[ \t]*\/\/[@|#][ \t]+sourceMappingURL=(.+?)[ \t]*$)|(?:^[ \t]*\/\*[@#][ \t]+sourceMappingURL=(.+?)[ \t]*\*\/[ \t]*$)/mg

function decodeBase64(base64) {
  return new Buffer(base64, 'base64').toString();
}

function stripComment(sm) {
  return sm.split(',').pop();
}

function readFromFileMap(sm, dir) {
  // NOTE: this will only work on the server since it attempts to read the map file

  var r = mapFileCommentRx.exec(sm);
  mapFileCommentRx.lastIndex = 0;
  
  // for some odd reason //# .. captures in 1 and /* .. */ in 2
  var filename = r[1] || r[2];
  var filepath = path.join(dir, filename);

  try {
    return fs.readFileSync(filepath, 'utf8');
  } catch (e) {
    throw new Error('An error occurred while trying to read the map file at ' + filepath + '\n' + e);
  }
}

function Converter (sm, opts) {
  opts = opts || {};
  try {
    if (opts.isFileComment) sm = readFromFileMap(sm, opts.commentFileDir);
    if (opts.hasComment) sm = stripComment(sm);
    if (opts.isEncoded) sm = decodeBase64(sm);
    if (opts.isJSON || opts.isEncoded) sm = JSON.parse(sm);

    this.sourcemap = sm;
  } catch(e) {
    console.error(e);
    return null;
  }
}

Converter.prototype.toJSON = function (space) {
  return JSON.stringify(this.sourcemap, null, space);
};

Converter.prototype.toBase64 = function () {
  var json = this.toJSON();
  return new Buffer(json).toString('base64');
};

Converter.prototype.toComment = function () {
  var base64 = this.toBase64();
  return '//# sourceMappingURL=data:application/json;base64,' + base64;
};

// returns copy instead of original
Converter.prototype.toObject = function () {
  return JSON.parse(this.toJSON());
};

Converter.prototype.addProperty = function (key, value) {
  if (this.sourcemap.hasOwnProperty(key)) throw new Error('property %s already exists on the sourcemap, use set property instead');
  return this.setProperty(key, value);
};

Converter.prototype.setProperty = function (key, value) {
  this.sourcemap[key] = value;
  return this;
};

Converter.prototype.getProperty = function (key) {
  return this.sourcemap[key];
};

exports.fromObject = function (obj) {
  return new Converter(obj);
};

exports.fromJSON = function (json) {
  return new Converter(json, { isJSON: true });
};

exports.fromBase64 = function (base64) {
  return new Converter(base64, { isEncoded: true });
};

exports.fromComment = function (comment) {
  comment = comment
    .replace(/^\/\*/g, '//')
    .replace(/\*\/$/g, '');

  return new Converter(comment, { isEncoded: true, hasComment: true });
};

exports.fromMapFileComment = function (comment, dir) {
  return new Converter(comment, { commentFileDir: dir, isFileComment: true, isJSON: true });
};

// Finds last sourcemap comment in file or returns null if none was found
exports.fromSource = function (content) {
  var m = content.match(commentRx);
  commentRx.lastIndex = 0;
  return m ? exports.fromComment(m.pop()) : null;
};

// Finds last sourcemap comment in file or returns null if none was found
exports.fromMapFileSource = function (content, dir) {
  var m = content.match(mapFileCommentRx);
  mapFileCommentRx.lastIndex = 0;
  return m ? exports.fromMapFileComment(m.pop(), dir) : null;
};

exports.removeComments = function (src) {
  commentRx.lastIndex = 0;
  return src.replace(commentRx, '');
};

exports.removeMapFileComments = function (src) {
  mapFileCommentRx.lastIndex = 0;
  return src.replace(mapFileCommentRx, '');
};

exports.__defineGetter__('commentRegex', function () {
  commentRx.lastIndex = 0;
  return commentRx; 
});

exports.__defineGetter__('mapFileCommentRegex', function () {
  mapFileCommentRx.lastIndex = 0;
  return mapFileCommentRx; 
});

}).call(this,require("buffer").Buffer)
},{"buffer":3,"fs":1,"path":6}],110:[function(require,module,exports){

var Color = require('color');

/**
 * Basic RGBA adjusters.
 */

exports.red = rgbaAdjuster('red');
exports.blue = rgbaAdjuster('blue');
exports.green = rgbaAdjuster('green');
exports.alpha = exports.a = rgbaAdjuster('alpha');

/**
 * RGB adjuster.
 */

exports.rgb = function () {
  // TODO
};

/**
 * Basic HSLWB adjusters.
 */

exports.hue = exports.h = hslwbAdjuster('hue');
exports.saturation = exports.s = hslwbAdjuster('saturation');
exports.lightness = exports.l = hslwbAdjuster('lightness');
exports.whiteness = exports.w = hslwbAdjuster('whiteness');
exports.blackness = exports.b = hslwbAdjuster('blackness');

/**
 * Blend adjuster.
 *
 * @param {Color} color
 * @param {Object} args
 */

exports.blend = function (color, args) {
  var other = new Color(args[0].value);
  var percentage = 1 - parseInt(args[1].value, 10) / 100;
  color.mix(other, percentage);
};

/**
 * Tint adjuster.
 *
 * @param {Color} color
 * @param {Object} args
 */

exports.tint = function (color, args) {
  args.unshift({ type: 'argument', value: 'white' });
  exports.blend(color, args);
};

/**
 * Share adjuster.
 *
 * @param {Color} color
 * @param {Object} args
 */

exports.shade = function (color, args) {
  args.unshift({ type: 'argument', value: 'black' });
  exports.blend(color, args);
};

/**
 * Contrast adjuster.
 *
 * @param {Color} color
 * @param {Object} args
 */
exports.contrast = function (color, args) {
  if (args.length == 0) args.push({ type: 'argument', value: '100%' });
  var percentage = 1 - parseInt(args[0].value, 10) / 100;
  var max = color.luminosity() < .5 ? new Color({ h:color.hue(), w:100, b:0 }) : new Color({ h:color.hue(), w:0, b:100 });
  var min = max;
  var minRatio = 4.5;
  if (color.contrast(max) > minRatio) {
    var min = binarySearchBWContrast(minRatio, color, max);
    min.mix(max, percentage);
  }
  color.hwb(min.hwb());
};

/**
 * Generate a value or percentage of modifier.
 *
 * @param {String} prop
 * @return {Function}
 */

function rgbaAdjuster (prop) {
  return function (color, args) {
    var mod;
    if (args[0].type == 'modifier') mod = args.shift().value;

    var val = args[0].value;
    if (val.indexOf('%') != -1) {
      val = parseInt(val, 10) / 100;
      if (!mod) {
        val = val * (prop == 'alpha' ? 1 : 255);
      } else if (mod != '*') {
        val = color[prop]() * val;
      }
    } else {
      val = Number(val);
    }

    color[prop](modify(color[prop](), val, mod));
  };
}

/**
 * Generate a basic HSLWB adjuster.
 *
 * @param {String} prop
 * @return {Function}
 */

function hslwbAdjuster (prop) {
  return function (color, args) {
    var mod;
    if (args[0].type == 'modifier') mod = args.shift().value;
    var val = parseFloat(args[0].value, 10);
    color[prop](modify(color[prop](), val, mod));
  };
}

/**
 * Return the percentage of a `number` for a given percentage `string`.
 *
 * @param {Number} number
 * @param {String} string
 * @return {Number}
 */

function percentageOf (number, string) {
  var percent = parseInt(string, 10) / 100;
  return number * percent;
}

/**
 * Modify a `val` by an `amount` with an optional `modifier`.
 *
 * @param {Number} val
 * @param {Number} amount
 * @param {String} modifier (optional)
 */

function modify (val, amount, modifier) {
  switch (modifier) {
    case '+': return val + amount;
    case '-': return val - amount;
    case '*': return val * amount;
    default: return amount;
  }
}

/**
 * Return the color closest to `color` between `color` and `max` that has a contrast ratio higher than `minRatio`
 *  assumes `color` and `max` have identical hue
 *
 * @param {Number} minRatio
 * @param {Color} color
 * @param {Color} max
 **/

function binarySearchBWContrast (minRatio, color, max) {
  var hue = color.hue();
  var min = color.clone();
  var minW = color.whiteness();
  var minB = color.blackness();
  var maxW = max.whiteness();
  var maxB = max.blackness();
  while (Math.abs(minW - maxW) > 1 || Math.abs(minB - maxB) > 1) {
    var midW = Math.round((maxW + minW) / 2);
    var midB = Math.round((maxB + minB) / 2);
    min.whiteness(midW);
    min.blackness(midB);
    if (min.contrast(color) > minRatio) {
      maxW = midW;
      maxB = midB;
    } else {
      minW = midW;
      minB = midB;
    }
  }
  return min
}

},{"color":107}],111:[function(require,module,exports){

var balanced = require('balanced-match');
var Color = require('color');
var parse = require('./parse');
var adjusters = require('./adjusters');

/**
 * Expose `convert`.
 */

module.exports = convert;

/**
 * Convert a color function CSS `string` into an RGB color string.
 *
 * @param {String} string
 * @return {String}
 */

function convert (string) {
  var index = string.indexOf('color(');
  if (index == -1) return string;

  string = string.slice(index);
  string = balanced('(', ')', string);
  if (!string) throw new SyntaxError('Missing closing parenthese for \'' + string + '\'');
  var ast = parse('color(' + string.body + ')');
  return toRGB(ast) + convert(string.post);
}

/**
 * Given a color `ast` return an RGB color string.
 *
 * @param {Object} ast
 * @return {String}
 */

function toRGB (ast) {
  var color = new Color(ast.arguments[0].type == "function" ? toRGB(ast.arguments[0]) : ast.arguments[0].value)
  var fns = ast.arguments.slice(1);

  fns.forEach(function (adjuster) {
    var name = adjuster.name;
    if (!adjusters[name]) throw new Error('Unknown <color-adjuster> \'' + name + '\'');

    // convert nested color functions
    adjuster.arguments.forEach(function (arg) {
      if (arg.type == 'function' && arg.name == 'color') {
        arg.value = toRGB(arg);
        arg.type = 'color';
        delete arg.name;
      }
    });

    // apply adjuster transformations
    adjusters[name](color, adjuster.arguments);
  });

  return color.rgbString();
}

},{"./adjusters":110,"./parse":113,"balanced-match":57,"color":107}],112:[function(require,module,exports){

var convert = require('./convert');
var parse = require('./parse');

/**
 * Expose `convert`.
 */

exports.convert = convert;

/**
 * Expose `parse`.
 */

exports.parse = parse;
},{"./convert":111,"./parse":113}],113:[function(require,module,exports){
var balanced = require('balanced-match');
var debug = require('debug')('css-color-function:parse');

/**
 * Expose `parse`.
 */

module.exports = parse;

/**
 * Parse a CSS color function string.
 *
 * @param {String} string
 * @return {Array}
 */

function parse (string) {
  if ('string' != typeof string) string = string.toString();
  debug('string %s', string);

  /**
   * Match the current position in the string against a `regexp`, returning the
   * match if one exists.
   *
   * @param {RegExp} regexp
   * @return {Undefined or Array}
   */

  function match (regexp) {
    var m = regexp.exec(string);
    if (!m) return;
    string = string.slice(m[0].length);
    return m.slice(1);
  }

  /**
   * Match whitespace.
   */

  function whitespace () {
    match(/^\s+/);
  }

  /**
   * Match a right parentheses.
   *
   * @return {Array or Undefined}
   */

  function rparen () {
    var m = match(/^\)/);
    if (!m) return;
    debug('rparen');
    return m;
  }

  /**
   * Match a modifier: '+' '-' '*'.
   *
   * @return {Object or Undefined}
   */

  function modifier () {
    var m = match(/^([\+\-\*])/);
    if (!m) return;
    var ret = {};
    ret.type = 'modifier';
    ret.value = m[0];
    debug('modifier %o', ret);
    return ret;
  }

  /**
   * Match a generic number function argument.
   *
   * @return {Object or Undefined}
   */

  function number () {
    var m = match(/^([^\)\s]+)/);
    if (!m) return;
    var ret = {};
    ret.type = 'number';
    ret.value = m[0];
    debug('number %o', ret);
    return ret;
  }

  /**
   * Match a function's arguments.
   *
   * @return {Array}
   */

  function args () {
    var ret = [];
    var el;
    while (el = modifier() || fn() || number()) {
      ret.push(el);
      whitespace();
    }
    debug('args %o', ret);
    return ret;
  }

  /**
   * Match an adjuster function.
   *
   * @return {Object or Undefined}
   */

  function adjuster () {
    var m = match(/^(\w+)\(/);
    if (!m) return;
    whitespace();
    var el;
    var ret = {};
    ret.type = 'function';
    ret.name = m[0];
    ret.arguments = args();
    rparen()
    debug('adjuster %o', ret);
    return ret;
  }

  /**
   * Match a color.
   *
   * @return {Object}
   */

  function color () {
    var ret = {};
    ret.type = 'color';

    var col = match(/([^\)\s]+)/)[0];
    if (col.indexOf('(') != -1) {
      var piece = match(/([^\)]*?\))/)[0];
      col = col + piece;
    }

    ret.value = col;
    whitespace();
    return ret;
  }

  /**
   * Match a color function, capturing the first color argument and any adjuster
   * functions after it.
   *
   * @return {Object or Undefined}
   */

  function fn () {
    if (!string.match(/^color\(/)) return;

    var colorRef = balanced('(', ')', string)
    if (!colorRef) throw new SyntaxError('Missing closing parenthese for \'' + string + '\'');
    if (colorRef.body === '') throw new SyntaxError('color() function cannot be empty');
    string = colorRef.body
    whitespace();

    var ret = {};
    ret.type = 'function';
    ret.name = 'color';
    ret.arguments = [fn() || color()];
    debug('function arguments %o', ret.arguments);

    var el;
    while (el = adjuster()) {
      ret.arguments.push(el);
      whitespace();
    }

    // pass the rest of the string in case of recursive color()
    string = colorRef.post
    whitespace();
    debug('function %o', ret);

    return ret;
  }

  /**
   * Return the parsed color function.
   */

  return fn();
}
},{"balanced-match":57,"debug":131}],114:[function(require,module,exports){
exports.parse = require('./lib/parse');
exports.stringify = require('./lib/stringify');

},{"./lib/parse":115,"./lib/stringify":119}],115:[function(require,module,exports){
// http://www.w3.org/TR/CSS21/grammar.html
// https://github.com/visionmedia/css-parse/pull/49#issuecomment-30088027
var commentre = /\/\*[^*]*\*+([^/*][^*]*\*+)*\//g

module.exports = function(css, options){
  options = options || {};

  /**
   * Positional.
   */

  var lineno = 1;
  var column = 1;

  /**
   * Update lineno and column based on `str`.
   */

  function updatePosition(str) {
    var lines = str.match(/\n/g);
    if (lines) lineno += lines.length;
    var i = str.lastIndexOf('\n');
    column = ~i ? str.length - i : column + str.length;
  }

  /**
   * Mark position and patch `node.position`.
   */

  function position() {
    var start = { line: lineno, column: column };
    return function(node){
      node.position = new Position(start);
      whitespace();
      return node;
    };
  }

  /**
   * Store position information for a node
   */

  function Position(start) {
    this.start = start;
    this.end = { line: lineno, column: column };
    this.source = options.source;
  }

  /**
   * Non-enumerable source string
   */

  Position.prototype.content = css;

  /**
   * Error `msg`.
   */

  var errorsList = [];

  function error(msg) {
    var err = new Error(options.source + ':' + lineno + ':' + column + ': ' + msg);
    err.reason = msg;
    err.filename = options.source;
    err.line = lineno;
    err.column = column;
    err.source = css;

    if (options.silent) {
      errorsList.push(err);
    } else {
      throw err;
    }
  }

  /**
   * Parse stylesheet.
   */

  function stylesheet() {
    var rulesList = rules();

    return {
      type: 'stylesheet',
      stylesheet: {
        rules: rulesList,
        parsingErrors: errorsList
      }
    };
  }

  /**
   * Opening brace.
   */

  function open() {
    return match(/^{\s*/);
  }

  /**
   * Closing brace.
   */

  function close() {
    return match(/^}/);
  }

  /**
   * Parse ruleset.
   */

  function rules() {
    var node;
    var rules = [];
    whitespace();
    comments(rules);
    while (css.length && css.charAt(0) != '}' && (node = atrule() || rule())) {
      if (node !== false) {
        rules.push(node);
        comments(rules);
      }
    }
    return rules;
  }

  /**
   * Match `re` and return captures.
   */

  function match(re) {
    var m = re.exec(css);
    if (!m) return;
    var str = m[0];
    updatePosition(str);
    css = css.slice(str.length);
    return m;
  }

  /**
   * Parse whitespace.
   */

  function whitespace() {
    match(/^\s*/);
  }

  /**
   * Parse comments;
   */

  function comments(rules) {
    var c;
    rules = rules || [];
    while (c = comment()) {
      if (c !== false) {
        rules.push(c);
      }
    }
    return rules;
  }

  /**
   * Parse comment.
   */

  function comment() {
    var pos = position();
    if ('/' != css.charAt(0) || '*' != css.charAt(1)) return;

    var i = 2;
    while ("" != css.charAt(i) && ('*' != css.charAt(i) || '/' != css.charAt(i + 1))) ++i;
    i += 2;

    if ("" === css.charAt(i-1)) {
      return error('End of comment missing');
    }

    var str = css.slice(2, i - 2);
    column += 2;
    updatePosition(str);
    css = css.slice(i);
    column += 2;

    return pos({
      type: 'comment',
      comment: str
    });
  }

  /**
   * Parse selector.
   */

  function selector() {
    var m = match(/^([^{]+)/);
    if (!m) return;
    /* @fix Remove all comments from selectors
     * http://ostermiller.org/findcomment.html */
    return trim(m[0])
      .replace(/\/\*([^*]|[\r\n]|(\*+([^*/]|[\r\n])))*\*\/+/g, '')
      .replace(/"(?:\\"|[^"])*"|'(?:\\'|[^'])*'/g, function(m) {
        return m.replace(/,/g, '\u200C');
      })
      .split(/\s*(?![^(]*\)),\s*/)
      .map(function(s) {
        return s.replace(/\u200C/g, ',');
      });
  }

  /**
   * Parse declaration.
   */

  function declaration() {
    var pos = position();

    // prop
    var prop = match(/^(\*?[-#\/\*\\\w]+(\[[0-9a-z_-]+\])?)\s*/);
    if (!prop) return;
    prop = trim(prop[0]);

    // :
    if (!match(/^:\s*/)) return error("property missing ':'");

    // val
    var val = match(/^((?:'(?:\\'|.)*?'|"(?:\\"|.)*?"|\([^\)]*?\)|[^};])+)/);

    var ret = pos({
      type: 'declaration',
      property: prop.replace(commentre, ''),
      value: val ? trim(val[0]).replace(commentre, '') : ''
    });

    // ;
    match(/^[;\s]*/);

    return ret;
  }

  /**
   * Parse declarations.
   */

  function declarations() {
    var decls = [];

    if (!open()) return error("missing '{'");
    comments(decls);

    // declarations
    var decl;
    while (decl = declaration()) {
      if (decl !== false) {
        decls.push(decl);
        comments(decls);
      }
    }

    if (!close()) return error("missing '}'");
    return decls;
  }

  /**
   * Parse keyframe.
   */

  function keyframe() {
    var m;
    var vals = [];
    var pos = position();

    while (m = match(/^((\d+\.\d+|\.\d+|\d+)%?|[a-z]+)\s*/)) {
      vals.push(m[1]);
      match(/^,\s*/);
    }

    if (!vals.length) return;

    return pos({
      type: 'keyframe',
      values: vals,
      declarations: declarations()
    });
  }

  /**
   * Parse keyframes.
   */

  function atkeyframes() {
    var pos = position();
    var m = match(/^@([-\w]+)?keyframes\s*/);

    if (!m) return;
    var vendor = m[1];

    // identifier
    var m = match(/^([-\w]+)\s*/);
    if (!m) return error("@keyframes missing name");
    var name = m[1];

    if (!open()) return error("@keyframes missing '{'");

    var frame;
    var frames = comments();
    while (frame = keyframe()) {
      frames.push(frame);
      frames = frames.concat(comments());
    }

    if (!close()) return error("@keyframes missing '}'");

    return pos({
      type: 'keyframes',
      name: name,
      vendor: vendor,
      keyframes: frames
    });
  }

  /**
   * Parse supports.
   */

  function atsupports() {
    var pos = position();
    var m = match(/^@supports *([^{]+)/);

    if (!m) return;
    var supports = trim(m[1]);

    if (!open()) return error("@supports missing '{'");

    var style = comments().concat(rules());

    if (!close()) return error("@supports missing '}'");

    return pos({
      type: 'supports',
      supports: supports,
      rules: style
    });
  }

  /**
   * Parse host.
   */

  function athost() {
    var pos = position();
    var m = match(/^@host\s*/);

    if (!m) return;

    if (!open()) return error("@host missing '{'");

    var style = comments().concat(rules());

    if (!close()) return error("@host missing '}'");

    return pos({
      type: 'host',
      rules: style
    });
  }

  /**
   * Parse media.
   */

  function atmedia() {
    var pos = position();
    var m = match(/^@media *([^{]+)/);

    if (!m) return;
    var media = trim(m[1]);

    if (!open()) return error("@media missing '{'");

    var style = comments().concat(rules());

    if (!close()) return error("@media missing '}'");

    return pos({
      type: 'media',
      media: media,
      rules: style
    });
  }


  /**
   * Parse custom-media.
   */

  function atcustommedia() {
    var pos = position();
    var m = match(/^@custom-media\s+(--[^\s]+)\s*([^{;]+);/);
    if (!m) return;

    return pos({
      type: 'custom-media',
      name: trim(m[1]),
      media: trim(m[2])
    });
  }

  /**
   * Parse paged media.
   */

  function atpage() {
    var pos = position();
    var m = match(/^@page */);
    if (!m) return;

    var sel = selector() || [];

    if (!open()) return error("@page missing '{'");
    var decls = comments();

    // declarations
    var decl;
    while (decl = declaration()) {
      decls.push(decl);
      decls = decls.concat(comments());
    }

    if (!close()) return error("@page missing '}'");

    return pos({
      type: 'page',
      selectors: sel,
      declarations: decls
    });
  }

  /**
   * Parse document.
   */

  function atdocument() {
    var pos = position();
    var m = match(/^@([-\w]+)?document *([^{]+)/);
    if (!m) return;

    var vendor = trim(m[1]);
    var doc = trim(m[2]);

    if (!open()) return error("@document missing '{'");

    var style = comments().concat(rules());

    if (!close()) return error("@document missing '}'");

    return pos({
      type: 'document',
      document: doc,
      vendor: vendor,
      rules: style
    });
  }

  /**
   * Parse font-face.
   */

  function atfontface() {
    var pos = position();
    var m = match(/^@font-face\s*/);
    if (!m) return;

    if (!open()) return error("@font-face missing '{'");
    var decls = comments();

    // declarations
    var decl;
    while (decl = declaration()) {
      decls.push(decl);
      decls = decls.concat(comments());
    }

    if (!close()) return error("@font-face missing '}'");

    return pos({
      type: 'font-face',
      declarations: decls
    });
  }

  /**
   * Parse import
   */

  var atimport = _compileAtrule('import');

  /**
   * Parse charset
   */

  var atcharset = _compileAtrule('charset');

  /**
   * Parse namespace
   */

  var atnamespace = _compileAtrule('namespace');

  /**
   * Parse non-block at-rules
   */


  function _compileAtrule(name) {
    var re = new RegExp('^@' + name + '\\s*([^;]+);');
    return function() {
      var pos = position();
      var m = match(re);
      if (!m) return;
      var ret = { type: name };
      ret[name] = m[1].trim();
      return pos(ret);
    }
  }

  /**
   * Parse at rule.
   */

  function atrule() {
    if (css[0] != '@') return;

    return atkeyframes()
      || atmedia()
      || atcustommedia()
      || atsupports()
      || atimport()
      || atcharset()
      || atnamespace()
      || atdocument()
      || atpage()
      || athost()
      || atfontface();
  }

  /**
   * Parse rule.
   */

  function rule() {
    var pos = position();
    var sel = selector();

    if (!sel) return error('selector missing');
    comments();

    return pos({
      type: 'rule',
      selectors: sel,
      declarations: declarations()
    });
  }

  return addParent(stylesheet());
};

/**
 * Trim `str`.
 */

function trim(str) {
  return str ? str.replace(/^\s+|\s+$/g, '') : '';
}

/**
 * Adds non-enumerable parent node reference to each node.
 */

function addParent(obj, parent) {
  var isNode = obj && typeof obj.type === 'string';
  var childParent = isNode ? obj : parent;

  for (var k in obj) {
    var value = obj[k];
    if (Array.isArray(value)) {
      value.forEach(function(v) { addParent(v, childParent); });
    } else if (value && typeof value === 'object') {
      addParent(value, childParent);
    }
  }

  if (isNode) {
    Object.defineProperty(obj, 'parent', {
      configurable: true,
      writable: true,
      enumerable: false,
      value: parent || null
    });
  }

  return obj;
}

},{}],116:[function(require,module,exports){

/**
 * Expose `Compiler`.
 */

module.exports = Compiler;

/**
 * Initialize a compiler.
 *
 * @param {Type} name
 * @return {Type}
 * @api public
 */

function Compiler(opts) {
  this.options = opts || {};
}

/**
 * Emit `str`
 */

Compiler.prototype.emit = function(str) {
  return str;
};

/**
 * Visit `node`.
 */

Compiler.prototype.visit = function(node){
  return this[node.type](node);
};

/**
 * Map visit over array of `nodes`, optionally using a `delim`
 */

Compiler.prototype.mapVisit = function(nodes, delim){
  var buf = '';
  delim = delim || '';

  for (var i = 0, length = nodes.length; i < length; i++) {
    buf += this.visit(nodes[i]);
    if (delim && i < length - 1) buf += this.emit(delim);
  }

  return buf;
};

},{}],117:[function(require,module,exports){

/**
 * Module dependencies.
 */

var Base = require('./compiler');
var inherits = require('inherits');

/**
 * Expose compiler.
 */

module.exports = Compiler;

/**
 * Initialize a new `Compiler`.
 */

function Compiler(options) {
  Base.call(this, options);
}

/**
 * Inherit from `Base.prototype`.
 */

inherits(Compiler, Base);

/**
 * Compile `node`.
 */

Compiler.prototype.compile = function(node){
  return node.stylesheet
    .rules.map(this.visit, this)
    .join('');
};

/**
 * Visit comment node.
 */

Compiler.prototype.comment = function(node){
  return this.emit('', node.position);
};

/**
 * Visit import node.
 */

Compiler.prototype.import = function(node){
  return this.emit('@import ' + node.import + ';', node.position);
};

/**
 * Visit media node.
 */

Compiler.prototype.media = function(node){
  return this.emit('@media ' + node.media, node.position)
    + this.emit('{')
    + this.mapVisit(node.rules)
    + this.emit('}');
};

/**
 * Visit document node.
 */

Compiler.prototype.document = function(node){
  var doc = '@' + (node.vendor || '') + 'document ' + node.document;

  return this.emit(doc, node.position)
    + this.emit('{')
    + this.mapVisit(node.rules)
    + this.emit('}');
};

/**
 * Visit charset node.
 */

Compiler.prototype.charset = function(node){
  return this.emit('@charset ' + node.charset + ';', node.position);
};

/**
 * Visit namespace node.
 */

Compiler.prototype.namespace = function(node){
  return this.emit('@namespace ' + node.namespace + ';', node.position);
};

/**
 * Visit supports node.
 */

Compiler.prototype.supports = function(node){
  return this.emit('@supports ' + node.supports, node.position)
    + this.emit('{')
    + this.mapVisit(node.rules)
    + this.emit('}');
};

/**
 * Visit keyframes node.
 */

Compiler.prototype.keyframes = function(node){
  return this.emit('@'
    + (node.vendor || '')
    + 'keyframes '
    + node.name, node.position)
    + this.emit('{')
    + this.mapVisit(node.keyframes)
    + this.emit('}');
};

/**
 * Visit keyframe node.
 */

Compiler.prototype.keyframe = function(node){
  var decls = node.declarations;

  return this.emit(node.values.join(','), node.position)
    + this.emit('{')
    + this.mapVisit(decls)
    + this.emit('}');
};

/**
 * Visit page node.
 */

Compiler.prototype.page = function(node){
  var sel = node.selectors.length
    ? node.selectors.join(', ')
    : '';

  return this.emit('@page ' + sel, node.position)
    + this.emit('{')
    + this.mapVisit(node.declarations)
    + this.emit('}');
};

/**
 * Visit font-face node.
 */

Compiler.prototype['font-face'] = function(node){
  return this.emit('@font-face', node.position)
    + this.emit('{')
    + this.mapVisit(node.declarations)
    + this.emit('}');
};

/**
 * Visit host node.
 */

Compiler.prototype.host = function(node){
  return this.emit('@host', node.position)
    + this.emit('{')
    + this.mapVisit(node.rules)
    + this.emit('}');
};

/**
 * Visit custom-media node.
 */

Compiler.prototype['custom-media'] = function(node){
  return this.emit('@custom-media ' + node.name + ' ' + node.media + ';', node.position);
};

/**
 * Visit rule node.
 */

Compiler.prototype.rule = function(node){
  var decls = node.declarations;
  if (!decls.length) return '';

  return this.emit(node.selectors.join(','), node.position)
    + this.emit('{')
    + this.mapVisit(decls)
    + this.emit('}');
};

/**
 * Visit declaration node.
 */

Compiler.prototype.declaration = function(node){
  return this.emit(node.property + ':' + node.value, node.position) + this.emit(';');
};


},{"./compiler":116,"inherits":134}],118:[function(require,module,exports){

/**
 * Module dependencies.
 */

var Base = require('./compiler');
var inherits = require('inherits');

/**
 * Expose compiler.
 */

module.exports = Compiler;

/**
 * Initialize a new `Compiler`.
 */

function Compiler(options) {
  options = options || {};
  Base.call(this, options);
  this.indentation = options.indent;
}

/**
 * Inherit from `Base.prototype`.
 */

inherits(Compiler, Base);

/**
 * Compile `node`.
 */

Compiler.prototype.compile = function(node){
  return this.stylesheet(node);
};

/**
 * Visit stylesheet node.
 */

Compiler.prototype.stylesheet = function(node){
  return this.mapVisit(node.stylesheet.rules, '\n\n');
};

/**
 * Visit comment node.
 */

Compiler.prototype.comment = function(node){
  return this.emit(this.indent() + '/*' + node.comment + '*/', node.position);
};

/**
 * Visit import node.
 */

Compiler.prototype.import = function(node){
  return this.emit('@import ' + node.import + ';', node.position);
};

/**
 * Visit media node.
 */

Compiler.prototype.media = function(node){
  return this.emit('@media ' + node.media, node.position)
    + this.emit(
        ' {\n'
        + this.indent(1))
    + this.mapVisit(node.rules, '\n\n')
    + this.emit(
        this.indent(-1)
        + '\n}');
};

/**
 * Visit document node.
 */

Compiler.prototype.document = function(node){
  var doc = '@' + (node.vendor || '') + 'document ' + node.document;

  return this.emit(doc, node.position)
    + this.emit(
        ' '
      + ' {\n'
      + this.indent(1))
    + this.mapVisit(node.rules, '\n\n')
    + this.emit(
        this.indent(-1)
        + '\n}');
};

/**
 * Visit charset node.
 */

Compiler.prototype.charset = function(node){
  return this.emit('@charset ' + node.charset + ';', node.position);
};

/**
 * Visit namespace node.
 */

Compiler.prototype.namespace = function(node){
  return this.emit('@namespace ' + node.namespace + ';', node.position);
};

/**
 * Visit supports node.
 */

Compiler.prototype.supports = function(node){
  return this.emit('@supports ' + node.supports, node.position)
    + this.emit(
      ' {\n'
      + this.indent(1))
    + this.mapVisit(node.rules, '\n\n')
    + this.emit(
        this.indent(-1)
        + '\n}');
};

/**
 * Visit keyframes node.
 */

Compiler.prototype.keyframes = function(node){
  return this.emit('@' + (node.vendor || '') + 'keyframes ' + node.name, node.position)
    + this.emit(
      ' {\n'
      + this.indent(1))
    + this.mapVisit(node.keyframes, '\n')
    + this.emit(
        this.indent(-1)
        + '}');
};

/**
 * Visit keyframe node.
 */

Compiler.prototype.keyframe = function(node){
  var decls = node.declarations;

  return this.emit(this.indent())
    + this.emit(node.values.join(', '), node.position)
    + this.emit(
      ' {\n'
      + this.indent(1))
    + this.mapVisit(decls, '\n')
    + this.emit(
      this.indent(-1)
      + '\n'
      + this.indent() + '}\n');
};

/**
 * Visit page node.
 */

Compiler.prototype.page = function(node){
  var sel = node.selectors.length
    ? node.selectors.join(', ') + ' '
    : '';

  return this.emit('@page ' + sel, node.position)
    + this.emit('{\n')
    + this.emit(this.indent(1))
    + this.mapVisit(node.declarations, '\n')
    + this.emit(this.indent(-1))
    + this.emit('\n}');
};

/**
 * Visit font-face node.
 */

Compiler.prototype['font-face'] = function(node){
  return this.emit('@font-face ', node.position)
    + this.emit('{\n')
    + this.emit(this.indent(1))
    + this.mapVisit(node.declarations, '\n')
    + this.emit(this.indent(-1))
    + this.emit('\n}');
};

/**
 * Visit host node.
 */

Compiler.prototype.host = function(node){
  return this.emit('@host', node.position)
    + this.emit(
        ' {\n'
        + this.indent(1))
    + this.mapVisit(node.rules, '\n\n')
    + this.emit(
        this.indent(-1)
        + '\n}');
};

/**
 * Visit custom-media node.
 */

Compiler.prototype['custom-media'] = function(node){
  return this.emit('@custom-media ' + node.name + ' ' + node.media + ';', node.position);
};

/**
 * Visit rule node.
 */

Compiler.prototype.rule = function(node){
  var indent = this.indent();
  var decls = node.declarations;
  if (!decls.length) return '';

  return this.emit(node.selectors.map(function(s){ return indent + s }).join(',\n'), node.position)
    + this.emit(' {\n')
    + this.emit(this.indent(1))
    + this.mapVisit(decls, '\n')
    + this.emit(this.indent(-1))
    + this.emit('\n' + this.indent() + '}');
};

/**
 * Visit declaration node.
 */

Compiler.prototype.declaration = function(node){
  return this.emit(this.indent())
    + this.emit(node.property + ': ' + node.value, node.position)
    + this.emit(';');
};

/**
 * Increase, decrease or return current indentation.
 */

Compiler.prototype.indent = function(level) {
  this.level = this.level || 1;

  if (null != level) {
    this.level += level;
    return '';
  }

  return Array(this.level).join(this.indentation || '  ');
};

},{"./compiler":116,"inherits":134}],119:[function(require,module,exports){

/**
 * Module dependencies.
 */

var Compressed = require('./compress');
var Identity = require('./identity');

/**
 * Stringfy the given AST `node`.
 *
 * Options:
 *
 *  - `compress` space-optimized output
 *  - `sourcemap` return an object with `.code` and `.map`
 *
 * @param {Object} node
 * @param {Object} [options]
 * @return {String}
 * @api public
 */

module.exports = function(node, options){
  options = options || {};

  var compiler = options.compress
    ? new Compressed(options)
    : new Identity(options);

  // source maps
  if (options.sourcemap) {
    var sourcemaps = require('./source-map-support');
    sourcemaps(compiler);

    var code = compiler.compile(node);
    compiler.applySourceMaps();

    var map = options.sourcemap === 'generator'
      ? compiler.map
      : compiler.map.toJSON();

    return { code: code, map: map };
  }

  var code = compiler.compile(node);
  return code;
};

},{"./compress":117,"./identity":118,"./source-map-support":120}],120:[function(require,module,exports){

/**
 * Module dependencies.
 */

var SourceMap = require('source-map').SourceMapGenerator;
var SourceMapConsumer = require('source-map').SourceMapConsumer;
var sourceMapResolve = require('source-map-resolve');
var urix = require('urix');
var fs = require('fs');
var path = require('path');

/**
 * Expose `mixin()`.
 */

module.exports = mixin;

/**
 * Mixin source map support into `compiler`.
 *
 * @param {Compiler} compiler
 * @api public
 */

function mixin(compiler) {
  compiler._comment = compiler.comment;
  compiler.map = new SourceMap();
  compiler.position = { line: 1, column: 1 };
  compiler.files = {};
  for (var k in exports) compiler[k] = exports[k];
}

/**
 * Update position.
 *
 * @param {String} str
 * @api private
 */

exports.updatePosition = function(str) {
  var lines = str.match(/\n/g);
  if (lines) this.position.line += lines.length;
  var i = str.lastIndexOf('\n');
  this.position.column = ~i ? str.length - i : this.position.column + str.length;
};

/**
 * Emit `str`.
 *
 * @param {String} str
 * @param {Object} [pos]
 * @return {String}
 * @api private
 */

exports.emit = function(str, pos) {
  if (pos) {
    var sourceFile = urix(pos.source || 'source.css');

    this.map.addMapping({
      source: sourceFile,
      generated: {
        line: this.position.line,
        column: Math.max(this.position.column - 1, 0)
      },
      original: {
        line: pos.start.line,
        column: pos.start.column - 1
      }
    });

    this.addFile(sourceFile, pos);
  }

  this.updatePosition(str);

  return str;
};

/**
 * Adds a file to the source map output if it has not already been added
 * @param {String} file
 * @param {Object} pos
 */

exports.addFile = function(file, pos) {
  if (typeof pos.content !== 'string') return;
  if (Object.prototype.hasOwnProperty.call(this.files, file)) return;

  this.files[file] = pos.content;
};

/**
 * Applies any original source maps to the output and embeds the source file
 * contents in the source map.
 */

exports.applySourceMaps = function() {
  Object.keys(this.files).forEach(function(file) {
    var content = this.files[file];
    this.map.setSourceContent(file, content);

    if (this.options.inputSourcemaps !== false) {
      var originalMap = sourceMapResolve.resolveSync(
        content, file, fs.readFileSync);
      if (originalMap) {
        var map = new SourceMapConsumer(originalMap.map);
        var relativeTo = originalMap.sourcesRelativeTo;
        this.map.applySourceMap(map, file, urix(path.dirname(relativeTo)));
      }
    }
  }, this);
};

/**
 * Process comments, drops sourceMap comments.
 * @param {Object} node
 */

exports.comment = function(node) {
  if (/^# sourceMappingURL=/.test(node.comment))
    return this.emit('', node.position);
  else
    return this._comment(node);
};

},{"fs":1,"path":6,"source-map":121,"source-map-resolve":177,"urix":190}],121:[function(require,module,exports){
/*
 * Copyright 2009-2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE.txt or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
exports.SourceMapGenerator = require('./source-map/source-map-generator').SourceMapGenerator;
exports.SourceMapConsumer = require('./source-map/source-map-consumer').SourceMapConsumer;
exports.SourceNode = require('./source-map/source-node').SourceNode;

},{"./source-map/source-map-consumer":127,"./source-map/source-map-generator":128,"./source-map/source-node":129}],122:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var util = require('./util');

  /**
   * A data structure which is a combination of an array and a set. Adding a new
   * member is O(1), testing for membership is O(1), and finding the index of an
   * element is O(1). Removing elements from the set is not supported. Only
   * strings are supported for membership.
   */
  function ArraySet() {
    this._array = [];
    this._set = {};
  }

  /**
   * Static method for creating ArraySet instances from an existing array.
   */
  ArraySet.fromArray = function ArraySet_fromArray(aArray, aAllowDuplicates) {
    var set = new ArraySet();
    for (var i = 0, len = aArray.length; i < len; i++) {
      set.add(aArray[i], aAllowDuplicates);
    }
    return set;
  };

  /**
   * Add the given string to this set.
   *
   * @param String aStr
   */
  ArraySet.prototype.add = function ArraySet_add(aStr, aAllowDuplicates) {
    var isDuplicate = this.has(aStr);
    var idx = this._array.length;
    if (!isDuplicate || aAllowDuplicates) {
      this._array.push(aStr);
    }
    if (!isDuplicate) {
      this._set[util.toSetString(aStr)] = idx;
    }
  };

  /**
   * Is the given string a member of this set?
   *
   * @param String aStr
   */
  ArraySet.prototype.has = function ArraySet_has(aStr) {
    return Object.prototype.hasOwnProperty.call(this._set,
                                                util.toSetString(aStr));
  };

  /**
   * What is the index of the given string in the array?
   *
   * @param String aStr
   */
  ArraySet.prototype.indexOf = function ArraySet_indexOf(aStr) {
    if (this.has(aStr)) {
      return this._set[util.toSetString(aStr)];
    }
    throw new Error('"' + aStr + '" is not in the set.');
  };

  /**
   * What is the element at the given index?
   *
   * @param Number aIdx
   */
  ArraySet.prototype.at = function ArraySet_at(aIdx) {
    if (aIdx >= 0 && aIdx < this._array.length) {
      return this._array[aIdx];
    }
    throw new Error('No element indexed by ' + aIdx);
  };

  /**
   * Returns the array representation of this set (which has the proper indices
   * indicated by indexOf). Note that this is a copy of the internal array used
   * for storing the members so that no one can mess with internal state.
   */
  ArraySet.prototype.toArray = function ArraySet_toArray() {
    return this._array.slice();
  };

  exports.ArraySet = ArraySet;

});

},{"./util":130,"amdefine":8}],123:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 *
 * Based on the Base 64 VLQ implementation in Closure Compiler:
 * https://code.google.com/p/closure-compiler/source/browse/trunk/src/com/google/debugging/sourcemap/Base64VLQ.java
 *
 * Copyright 2011 The Closure Compiler Authors. All rights reserved.
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *  * Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above
 *    copyright notice, this list of conditions and the following
 *    disclaimer in the documentation and/or other materials provided
 *    with the distribution.
 *  * Neither the name of Google Inc. nor the names of its
 *    contributors may be used to endorse or promote products derived
 *    from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var base64 = require('./base64');

  // A single base 64 digit can contain 6 bits of data. For the base 64 variable
  // length quantities we use in the source map spec, the first bit is the sign,
  // the next four bits are the actual value, and the 6th bit is the
  // continuation bit. The continuation bit tells us whether there are more
  // digits in this value following this digit.
  //
  //   Continuation
  //   |    Sign
  //   |    |
  //   V    V
  //   101011

  var VLQ_BASE_SHIFT = 5;

  // binary: 100000
  var VLQ_BASE = 1 << VLQ_BASE_SHIFT;

  // binary: 011111
  var VLQ_BASE_MASK = VLQ_BASE - 1;

  // binary: 100000
  var VLQ_CONTINUATION_BIT = VLQ_BASE;

  /**
   * Converts from a two-complement value to a value where the sign bit is
   * placed in the least significant bit.  For example, as decimals:
   *   1 becomes 2 (10 binary), -1 becomes 3 (11 binary)
   *   2 becomes 4 (100 binary), -2 becomes 5 (101 binary)
   */
  function toVLQSigned(aValue) {
    return aValue < 0
      ? ((-aValue) << 1) + 1
      : (aValue << 1) + 0;
  }

  /**
   * Converts to a two-complement value from a value where the sign bit is
   * placed in the least significant bit.  For example, as decimals:
   *   2 (10 binary) becomes 1, 3 (11 binary) becomes -1
   *   4 (100 binary) becomes 2, 5 (101 binary) becomes -2
   */
  function fromVLQSigned(aValue) {
    var isNegative = (aValue & 1) === 1;
    var shifted = aValue >> 1;
    return isNegative
      ? -shifted
      : shifted;
  }

  /**
   * Returns the base 64 VLQ encoded value.
   */
  exports.encode = function base64VLQ_encode(aValue) {
    var encoded = "";
    var digit;

    var vlq = toVLQSigned(aValue);

    do {
      digit = vlq & VLQ_BASE_MASK;
      vlq >>>= VLQ_BASE_SHIFT;
      if (vlq > 0) {
        // There are still more digits in this value, so we must make sure the
        // continuation bit is marked.
        digit |= VLQ_CONTINUATION_BIT;
      }
      encoded += base64.encode(digit);
    } while (vlq > 0);

    return encoded;
  };

  /**
   * Decodes the next base 64 VLQ value from the given string and returns the
   * value and the rest of the string via the out parameter.
   */
  exports.decode = function base64VLQ_decode(aStr, aOutParam) {
    var i = 0;
    var strLen = aStr.length;
    var result = 0;
    var shift = 0;
    var continuation, digit;

    do {
      if (i >= strLen) {
        throw new Error("Expected more digits in base 64 VLQ value.");
      }
      digit = base64.decode(aStr.charAt(i++));
      continuation = !!(digit & VLQ_CONTINUATION_BIT);
      digit &= VLQ_BASE_MASK;
      result = result + (digit << shift);
      shift += VLQ_BASE_SHIFT;
    } while (continuation);

    aOutParam.value = fromVLQSigned(result);
    aOutParam.rest = aStr.slice(i);
  };

});

},{"./base64":124,"amdefine":8}],124:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var charToIntMap = {};
  var intToCharMap = {};

  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    .split('')
    .forEach(function (ch, index) {
      charToIntMap[ch] = index;
      intToCharMap[index] = ch;
    });

  /**
   * Encode an integer in the range of 0 to 63 to a single base 64 digit.
   */
  exports.encode = function base64_encode(aNumber) {
    if (aNumber in intToCharMap) {
      return intToCharMap[aNumber];
    }
    throw new TypeError("Must be between 0 and 63: " + aNumber);
  };

  /**
   * Decode a single base 64 digit to an integer.
   */
  exports.decode = function base64_decode(aChar) {
    if (aChar in charToIntMap) {
      return charToIntMap[aChar];
    }
    throw new TypeError("Not a valid base 64 digit: " + aChar);
  };

});

},{"amdefine":8}],125:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  /**
   * Recursive implementation of binary search.
   *
   * @param aLow Indices here and lower do not contain the needle.
   * @param aHigh Indices here and higher do not contain the needle.
   * @param aNeedle The element being searched for.
   * @param aHaystack The non-empty array being searched.
   * @param aCompare Function which takes two elements and returns -1, 0, or 1.
   */
  function recursiveSearch(aLow, aHigh, aNeedle, aHaystack, aCompare) {
    // This function terminates when one of the following is true:
    //
    //   1. We find the exact element we are looking for.
    //
    //   2. We did not find the exact element, but we can return the index of
    //      the next closest element that is less than that element.
    //
    //   3. We did not find the exact element, and there is no next-closest
    //      element which is less than the one we are searching for, so we
    //      return -1.
    var mid = Math.floor((aHigh - aLow) / 2) + aLow;
    var cmp = aCompare(aNeedle, aHaystack[mid], true);
    if (cmp === 0) {
      // Found the element we are looking for.
      return mid;
    }
    else if (cmp > 0) {
      // aHaystack[mid] is greater than our needle.
      if (aHigh - mid > 1) {
        // The element is in the upper half.
        return recursiveSearch(mid, aHigh, aNeedle, aHaystack, aCompare);
      }
      // We did not find an exact match, return the next closest one
      // (termination case 2).
      return mid;
    }
    else {
      // aHaystack[mid] is less than our needle.
      if (mid - aLow > 1) {
        // The element is in the lower half.
        return recursiveSearch(aLow, mid, aNeedle, aHaystack, aCompare);
      }
      // The exact needle element was not found in this haystack. Determine if
      // we are in termination case (2) or (3) and return the appropriate thing.
      return aLow < 0 ? -1 : aLow;
    }
  }

  /**
   * This is an implementation of binary search which will always try and return
   * the index of next lowest value checked if there is no exact hit. This is
   * because mappings between original and generated line/col pairs are single
   * points, and there is an implicit region between each of them, so a miss
   * just means that you aren't on the very start of a region.
   *
   * @param aNeedle The element you are looking for.
   * @param aHaystack The array that is being searched.
   * @param aCompare A function which takes the needle and an element in the
   *     array and returns -1, 0, or 1 depending on whether the needle is less
   *     than, equal to, or greater than the element, respectively.
   */
  exports.search = function search(aNeedle, aHaystack, aCompare) {
    if (aHaystack.length === 0) {
      return -1;
    }
    return recursiveSearch(-1, aHaystack.length, aNeedle, aHaystack, aCompare)
  };

});

},{"amdefine":8}],126:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2014 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var util = require('./util');

  /**
   * Determine whether mappingB is after mappingA with respect to generated
   * position.
   */
  function generatedPositionAfter(mappingA, mappingB) {
    // Optimized for most common case
    var lineA = mappingA.generatedLine;
    var lineB = mappingB.generatedLine;
    var columnA = mappingA.generatedColumn;
    var columnB = mappingB.generatedColumn;
    return lineB > lineA || lineB == lineA && columnB >= columnA ||
           util.compareByGeneratedPositions(mappingA, mappingB) <= 0;
  }

  /**
   * A data structure to provide a sorted view of accumulated mappings in a
   * performance conscious manner. It trades a neglibable overhead in general
   * case for a large speedup in case of mappings being added in order.
   */
  function MappingList() {
    this._array = [];
    this._sorted = true;
    // Serves as infimum
    this._last = {generatedLine: -1, generatedColumn: 0};
  }

  /**
   * Iterate through internal items. This method takes the same arguments that
   * `Array.prototype.forEach` takes.
   *
   * NOTE: The order of the mappings is NOT guaranteed.
   */
  MappingList.prototype.unsortedForEach =
    function MappingList_forEach(aCallback, aThisArg) {
      this._array.forEach(aCallback, aThisArg);
    };

  /**
   * Add the given source mapping.
   *
   * @param Object aMapping
   */
  MappingList.prototype.add = function MappingList_add(aMapping) {
    var mapping;
    if (generatedPositionAfter(this._last, aMapping)) {
      this._last = aMapping;
      this._array.push(aMapping);
    } else {
      this._sorted = false;
      this._array.push(aMapping);
    }
  };

  /**
   * Returns the flat, sorted array of mappings. The mappings are sorted by
   * generated position.
   *
   * WARNING: This method returns internal data without copying, for
   * performance. The return value must NOT be mutated, and should be treated as
   * an immutable borrow. If you want to take ownership, you must make your own
   * copy.
   */
  MappingList.prototype.toArray = function MappingList_toArray() {
    if (!this._sorted) {
      this._array.sort(util.compareByGeneratedPositions);
      this._sorted = true;
    }
    return this._array;
  };

  exports.MappingList = MappingList;

});

},{"./util":130,"amdefine":8}],127:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var util = require('./util');
  var binarySearch = require('./binary-search');
  var ArraySet = require('./array-set').ArraySet;
  var base64VLQ = require('./base64-vlq');

  /**
   * A SourceMapConsumer instance represents a parsed source map which we can
   * query for information about the original file positions by giving it a file
   * position in the generated source.
   *
   * The only parameter is the raw source map (either as a JSON string, or
   * already parsed to an object). According to the spec, source maps have the
   * following attributes:
   *
   *   - version: Which version of the source map spec this map is following.
   *   - sources: An array of URLs to the original source files.
   *   - names: An array of identifiers which can be referrenced by individual mappings.
   *   - sourceRoot: Optional. The URL root from which all sources are relative.
   *   - sourcesContent: Optional. An array of contents of the original source files.
   *   - mappings: A string of base64 VLQs which contain the actual mappings.
   *   - file: Optional. The generated file this source map is associated with.
   *
   * Here is an example source map, taken from the source map spec[0]:
   *
   *     {
   *       version : 3,
   *       file: "out.js",
   *       sourceRoot : "",
   *       sources: ["foo.js", "bar.js"],
   *       names: ["src", "maps", "are", "fun"],
   *       mappings: "AA,AB;;ABCDE;"
   *     }
   *
   * [0]: https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit?pli=1#
   */
  function SourceMapConsumer(aSourceMap) {
    var sourceMap = aSourceMap;
    if (typeof aSourceMap === 'string') {
      sourceMap = JSON.parse(aSourceMap.replace(/^\)\]\}'/, ''));
    }

    var version = util.getArg(sourceMap, 'version');
    var sources = util.getArg(sourceMap, 'sources');
    // Sass 3.3 leaves out the 'names' array, so we deviate from the spec (which
    // requires the array) to play nice here.
    var names = util.getArg(sourceMap, 'names', []);
    var sourceRoot = util.getArg(sourceMap, 'sourceRoot', null);
    var sourcesContent = util.getArg(sourceMap, 'sourcesContent', null);
    var mappings = util.getArg(sourceMap, 'mappings');
    var file = util.getArg(sourceMap, 'file', null);

    // Once again, Sass deviates from the spec and supplies the version as a
    // string rather than a number, so we use loose equality checking here.
    if (version != this._version) {
      throw new Error('Unsupported version: ' + version);
    }

    // Some source maps produce relative source paths like "./foo.js" instead of
    // "foo.js".  Normalize these first so that future comparisons will succeed.
    // See bugzil.la/1090768.
    sources = sources.map(util.normalize);

    // Pass `true` below to allow duplicate names and sources. While source maps
    // are intended to be compressed and deduplicated, the TypeScript compiler
    // sometimes generates source maps with duplicates in them. See Github issue
    // #72 and bugzil.la/889492.
    this._names = ArraySet.fromArray(names, true);
    this._sources = ArraySet.fromArray(sources, true);

    this.sourceRoot = sourceRoot;
    this.sourcesContent = sourcesContent;
    this._mappings = mappings;
    this.file = file;
  }

  /**
   * Create a SourceMapConsumer from a SourceMapGenerator.
   *
   * @param SourceMapGenerator aSourceMap
   *        The source map that will be consumed.
   * @returns SourceMapConsumer
   */
  SourceMapConsumer.fromSourceMap =
    function SourceMapConsumer_fromSourceMap(aSourceMap) {
      var smc = Object.create(SourceMapConsumer.prototype);

      smc._names = ArraySet.fromArray(aSourceMap._names.toArray(), true);
      smc._sources = ArraySet.fromArray(aSourceMap._sources.toArray(), true);
      smc.sourceRoot = aSourceMap._sourceRoot;
      smc.sourcesContent = aSourceMap._generateSourcesContent(smc._sources.toArray(),
                                                              smc.sourceRoot);
      smc.file = aSourceMap._file;

      smc.__generatedMappings = aSourceMap._mappings.toArray().slice();
      smc.__originalMappings = aSourceMap._mappings.toArray().slice()
        .sort(util.compareByOriginalPositions);

      return smc;
    };

  /**
   * The version of the source mapping spec that we are consuming.
   */
  SourceMapConsumer.prototype._version = 3;

  /**
   * The list of original sources.
   */
  Object.defineProperty(SourceMapConsumer.prototype, 'sources', {
    get: function () {
      return this._sources.toArray().map(function (s) {
        return this.sourceRoot != null ? util.join(this.sourceRoot, s) : s;
      }, this);
    }
  });

  // `__generatedMappings` and `__originalMappings` are arrays that hold the
  // parsed mapping coordinates from the source map's "mappings" attribute. They
  // are lazily instantiated, accessed via the `_generatedMappings` and
  // `_originalMappings` getters respectively, and we only parse the mappings
  // and create these arrays once queried for a source location. We jump through
  // these hoops because there can be many thousands of mappings, and parsing
  // them is expensive, so we only want to do it if we must.
  //
  // Each object in the arrays is of the form:
  //
  //     {
  //       generatedLine: The line number in the generated code,
  //       generatedColumn: The column number in the generated code,
  //       source: The path to the original source file that generated this
  //               chunk of code,
  //       originalLine: The line number in the original source that
  //                     corresponds to this chunk of generated code,
  //       originalColumn: The column number in the original source that
  //                       corresponds to this chunk of generated code,
  //       name: The name of the original symbol which generated this chunk of
  //             code.
  //     }
  //
  // All properties except for `generatedLine` and `generatedColumn` can be
  // `null`.
  //
  // `_generatedMappings` is ordered by the generated positions.
  //
  // `_originalMappings` is ordered by the original positions.

  SourceMapConsumer.prototype.__generatedMappings = null;
  Object.defineProperty(SourceMapConsumer.prototype, '_generatedMappings', {
    get: function () {
      if (!this.__generatedMappings) {
        this.__generatedMappings = [];
        this.__originalMappings = [];
        this._parseMappings(this._mappings, this.sourceRoot);
      }

      return this.__generatedMappings;
    }
  });

  SourceMapConsumer.prototype.__originalMappings = null;
  Object.defineProperty(SourceMapConsumer.prototype, '_originalMappings', {
    get: function () {
      if (!this.__originalMappings) {
        this.__generatedMappings = [];
        this.__originalMappings = [];
        this._parseMappings(this._mappings, this.sourceRoot);
      }

      return this.__originalMappings;
    }
  });

  SourceMapConsumer.prototype._nextCharIsMappingSeparator =
    function SourceMapConsumer_nextCharIsMappingSeparator(aStr) {
      var c = aStr.charAt(0);
      return c === ";" || c === ",";
    };

  /**
   * Parse the mappings in a string in to a data structure which we can easily
   * query (the ordered arrays in the `this.__generatedMappings` and
   * `this.__originalMappings` properties).
   */
  SourceMapConsumer.prototype._parseMappings =
    function SourceMapConsumer_parseMappings(aStr, aSourceRoot) {
      var generatedLine = 1;
      var previousGeneratedColumn = 0;
      var previousOriginalLine = 0;
      var previousOriginalColumn = 0;
      var previousSource = 0;
      var previousName = 0;
      var str = aStr;
      var temp = {};
      var mapping;

      while (str.length > 0) {
        if (str.charAt(0) === ';') {
          generatedLine++;
          str = str.slice(1);
          previousGeneratedColumn = 0;
        }
        else if (str.charAt(0) === ',') {
          str = str.slice(1);
        }
        else {
          mapping = {};
          mapping.generatedLine = generatedLine;

          // Generated column.
          base64VLQ.decode(str, temp);
          mapping.generatedColumn = previousGeneratedColumn + temp.value;
          previousGeneratedColumn = mapping.generatedColumn;
          str = temp.rest;

          if (str.length > 0 && !this._nextCharIsMappingSeparator(str)) {
            // Original source.
            base64VLQ.decode(str, temp);
            mapping.source = this._sources.at(previousSource + temp.value);
            previousSource += temp.value;
            str = temp.rest;
            if (str.length === 0 || this._nextCharIsMappingSeparator(str)) {
              throw new Error('Found a source, but no line and column');
            }

            // Original line.
            base64VLQ.decode(str, temp);
            mapping.originalLine = previousOriginalLine + temp.value;
            previousOriginalLine = mapping.originalLine;
            // Lines are stored 0-based
            mapping.originalLine += 1;
            str = temp.rest;
            if (str.length === 0 || this._nextCharIsMappingSeparator(str)) {
              throw new Error('Found a source and line, but no column');
            }

            // Original column.
            base64VLQ.decode(str, temp);
            mapping.originalColumn = previousOriginalColumn + temp.value;
            previousOriginalColumn = mapping.originalColumn;
            str = temp.rest;

            if (str.length > 0 && !this._nextCharIsMappingSeparator(str)) {
              // Original name.
              base64VLQ.decode(str, temp);
              mapping.name = this._names.at(previousName + temp.value);
              previousName += temp.value;
              str = temp.rest;
            }
          }

          this.__generatedMappings.push(mapping);
          if (typeof mapping.originalLine === 'number') {
            this.__originalMappings.push(mapping);
          }
        }
      }

      this.__generatedMappings.sort(util.compareByGeneratedPositions);
      this.__originalMappings.sort(util.compareByOriginalPositions);
    };

  /**
   * Find the mapping that best matches the hypothetical "needle" mapping that
   * we are searching for in the given "haystack" of mappings.
   */
  SourceMapConsumer.prototype._findMapping =
    function SourceMapConsumer_findMapping(aNeedle, aMappings, aLineName,
                                           aColumnName, aComparator) {
      // To return the position we are searching for, we must first find the
      // mapping for the given position and then return the opposite position it
      // points to. Because the mappings are sorted, we can use binary search to
      // find the best mapping.

      if (aNeedle[aLineName] <= 0) {
        throw new TypeError('Line must be greater than or equal to 1, got '
                            + aNeedle[aLineName]);
      }
      if (aNeedle[aColumnName] < 0) {
        throw new TypeError('Column must be greater than or equal to 0, got '
                            + aNeedle[aColumnName]);
      }

      return binarySearch.search(aNeedle, aMappings, aComparator);
    };

  /**
   * Compute the last column for each generated mapping. The last column is
   * inclusive.
   */
  SourceMapConsumer.prototype.computeColumnSpans =
    function SourceMapConsumer_computeColumnSpans() {
      for (var index = 0; index < this._generatedMappings.length; ++index) {
        var mapping = this._generatedMappings[index];

        // Mappings do not contain a field for the last generated columnt. We
        // can come up with an optimistic estimate, however, by assuming that
        // mappings are contiguous (i.e. given two consecutive mappings, the
        // first mapping ends where the second one starts).
        if (index + 1 < this._generatedMappings.length) {
          var nextMapping = this._generatedMappings[index + 1];

          if (mapping.generatedLine === nextMapping.generatedLine) {
            mapping.lastGeneratedColumn = nextMapping.generatedColumn - 1;
            continue;
          }
        }

        // The last mapping for each line spans the entire line.
        mapping.lastGeneratedColumn = Infinity;
      }
    };

  /**
   * Returns the original source, line, and column information for the generated
   * source's line and column positions provided. The only argument is an object
   * with the following properties:
   *
   *   - line: The line number in the generated source.
   *   - column: The column number in the generated source.
   *
   * and an object is returned with the following properties:
   *
   *   - source: The original source file, or null.
   *   - line: The line number in the original source, or null.
   *   - column: The column number in the original source, or null.
   *   - name: The original identifier, or null.
   */
  SourceMapConsumer.prototype.originalPositionFor =
    function SourceMapConsumer_originalPositionFor(aArgs) {
      var needle = {
        generatedLine: util.getArg(aArgs, 'line'),
        generatedColumn: util.getArg(aArgs, 'column')
      };

      var index = this._findMapping(needle,
                                    this._generatedMappings,
                                    "generatedLine",
                                    "generatedColumn",
                                    util.compareByGeneratedPositions);

      if (index >= 0) {
        var mapping = this._generatedMappings[index];

        if (mapping.generatedLine === needle.generatedLine) {
          var source = util.getArg(mapping, 'source', null);
          if (source != null && this.sourceRoot != null) {
            source = util.join(this.sourceRoot, source);
          }
          return {
            source: source,
            line: util.getArg(mapping, 'originalLine', null),
            column: util.getArg(mapping, 'originalColumn', null),
            name: util.getArg(mapping, 'name', null)
          };
        }
      }

      return {
        source: null,
        line: null,
        column: null,
        name: null
      };
    };

  /**
   * Returns the original source content. The only argument is the url of the
   * original source file. Returns null if no original source content is
   * availible.
   */
  SourceMapConsumer.prototype.sourceContentFor =
    function SourceMapConsumer_sourceContentFor(aSource) {
      if (!this.sourcesContent) {
        return null;
      }

      if (this.sourceRoot != null) {
        aSource = util.relative(this.sourceRoot, aSource);
      }

      if (this._sources.has(aSource)) {
        return this.sourcesContent[this._sources.indexOf(aSource)];
      }

      var url;
      if (this.sourceRoot != null
          && (url = util.urlParse(this.sourceRoot))) {
        // XXX: file:// URIs and absolute paths lead to unexpected behavior for
        // many users. We can help them out when they expect file:// URIs to
        // behave like it would if they were running a local HTTP server. See
        // https://bugzilla.mozilla.org/show_bug.cgi?id=885597.
        var fileUriAbsPath = aSource.replace(/^file:\/\//, "");
        if (url.scheme == "file"
            && this._sources.has(fileUriAbsPath)) {
          return this.sourcesContent[this._sources.indexOf(fileUriAbsPath)]
        }

        if ((!url.path || url.path == "/")
            && this._sources.has("/" + aSource)) {
          return this.sourcesContent[this._sources.indexOf("/" + aSource)];
        }
      }

      throw new Error('"' + aSource + '" is not in the SourceMap.');
    };

  /**
   * Returns the generated line and column information for the original source,
   * line, and column positions provided. The only argument is an object with
   * the following properties:
   *
   *   - source: The filename of the original source.
   *   - line: The line number in the original source.
   *   - column: The column number in the original source.
   *
   * and an object is returned with the following properties:
   *
   *   - line: The line number in the generated source, or null.
   *   - column: The column number in the generated source, or null.
   */
  SourceMapConsumer.prototype.generatedPositionFor =
    function SourceMapConsumer_generatedPositionFor(aArgs) {
      var needle = {
        source: util.getArg(aArgs, 'source'),
        originalLine: util.getArg(aArgs, 'line'),
        originalColumn: util.getArg(aArgs, 'column')
      };

      if (this.sourceRoot != null) {
        needle.source = util.relative(this.sourceRoot, needle.source);
      }

      var index = this._findMapping(needle,
                                    this._originalMappings,
                                    "originalLine",
                                    "originalColumn",
                                    util.compareByOriginalPositions);

      if (index >= 0) {
        var mapping = this._originalMappings[index];

        return {
          line: util.getArg(mapping, 'generatedLine', null),
          column: util.getArg(mapping, 'generatedColumn', null),
          lastColumn: util.getArg(mapping, 'lastGeneratedColumn', null)
        };
      }

      return {
        line: null,
        column: null,
        lastColumn: null
      };
    };

  /**
   * Returns all generated line and column information for the original source
   * and line provided. The only argument is an object with the following
   * properties:
   *
   *   - source: The filename of the original source.
   *   - line: The line number in the original source.
   *
   * and an array of objects is returned, each with the following properties:
   *
   *   - line: The line number in the generated source, or null.
   *   - column: The column number in the generated source, or null.
   */
  SourceMapConsumer.prototype.allGeneratedPositionsFor =
    function SourceMapConsumer_allGeneratedPositionsFor(aArgs) {
      // When there is no exact match, SourceMapConsumer.prototype._findMapping
      // returns the index of the closest mapping less than the needle. By
      // setting needle.originalColumn to Infinity, we thus find the last
      // mapping for the given line, provided such a mapping exists.
      var needle = {
        source: util.getArg(aArgs, 'source'),
        originalLine: util.getArg(aArgs, 'line'),
        originalColumn: Infinity
      };

      if (this.sourceRoot != null) {
        needle.source = util.relative(this.sourceRoot, needle.source);
      }

      var mappings = [];

      var index = this._findMapping(needle,
                                    this._originalMappings,
                                    "originalLine",
                                    "originalColumn",
                                    util.compareByOriginalPositions);
      if (index >= 0) {
        var mapping = this._originalMappings[index];

        while (mapping && mapping.originalLine === needle.originalLine) {
          mappings.push({
            line: util.getArg(mapping, 'generatedLine', null),
            column: util.getArg(mapping, 'generatedColumn', null),
            lastColumn: util.getArg(mapping, 'lastGeneratedColumn', null)
          });

          mapping = this._originalMappings[--index];
        }
      }

      return mappings.reverse();
    };

  SourceMapConsumer.GENERATED_ORDER = 1;
  SourceMapConsumer.ORIGINAL_ORDER = 2;

  /**
   * Iterate over each mapping between an original source/line/column and a
   * generated line/column in this source map.
   *
   * @param Function aCallback
   *        The function that is called with each mapping.
   * @param Object aContext
   *        Optional. If specified, this object will be the value of `this` every
   *        time that `aCallback` is called.
   * @param aOrder
   *        Either `SourceMapConsumer.GENERATED_ORDER` or
   *        `SourceMapConsumer.ORIGINAL_ORDER`. Specifies whether you want to
   *        iterate over the mappings sorted by the generated file's line/column
   *        order or the original's source/line/column order, respectively. Defaults to
   *        `SourceMapConsumer.GENERATED_ORDER`.
   */
  SourceMapConsumer.prototype.eachMapping =
    function SourceMapConsumer_eachMapping(aCallback, aContext, aOrder) {
      var context = aContext || null;
      var order = aOrder || SourceMapConsumer.GENERATED_ORDER;

      var mappings;
      switch (order) {
      case SourceMapConsumer.GENERATED_ORDER:
        mappings = this._generatedMappings;
        break;
      case SourceMapConsumer.ORIGINAL_ORDER:
        mappings = this._originalMappings;
        break;
      default:
        throw new Error("Unknown order of iteration.");
      }

      var sourceRoot = this.sourceRoot;
      mappings.map(function (mapping) {
        var source = mapping.source;
        if (source != null && sourceRoot != null) {
          source = util.join(sourceRoot, source);
        }
        return {
          source: source,
          generatedLine: mapping.generatedLine,
          generatedColumn: mapping.generatedColumn,
          originalLine: mapping.originalLine,
          originalColumn: mapping.originalColumn,
          name: mapping.name
        };
      }).forEach(aCallback, context);
    };

  exports.SourceMapConsumer = SourceMapConsumer;

});

},{"./array-set":122,"./base64-vlq":123,"./binary-search":125,"./util":130,"amdefine":8}],128:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var base64VLQ = require('./base64-vlq');
  var util = require('./util');
  var ArraySet = require('./array-set').ArraySet;
  var MappingList = require('./mapping-list').MappingList;

  /**
   * An instance of the SourceMapGenerator represents a source map which is
   * being built incrementally. You may pass an object with the following
   * properties:
   *
   *   - file: The filename of the generated source.
   *   - sourceRoot: A root for all relative URLs in this source map.
   */
  function SourceMapGenerator(aArgs) {
    if (!aArgs) {
      aArgs = {};
    }
    this._file = util.getArg(aArgs, 'file', null);
    this._sourceRoot = util.getArg(aArgs, 'sourceRoot', null);
    this._skipValidation = util.getArg(aArgs, 'skipValidation', false);
    this._sources = new ArraySet();
    this._names = new ArraySet();
    this._mappings = new MappingList();
    this._sourcesContents = null;
  }

  SourceMapGenerator.prototype._version = 3;

  /**
   * Creates a new SourceMapGenerator based on a SourceMapConsumer
   *
   * @param aSourceMapConsumer The SourceMap.
   */
  SourceMapGenerator.fromSourceMap =
    function SourceMapGenerator_fromSourceMap(aSourceMapConsumer) {
      var sourceRoot = aSourceMapConsumer.sourceRoot;
      var generator = new SourceMapGenerator({
        file: aSourceMapConsumer.file,
        sourceRoot: sourceRoot
      });
      aSourceMapConsumer.eachMapping(function (mapping) {
        var newMapping = {
          generated: {
            line: mapping.generatedLine,
            column: mapping.generatedColumn
          }
        };

        if (mapping.source != null) {
          newMapping.source = mapping.source;
          if (sourceRoot != null) {
            newMapping.source = util.relative(sourceRoot, newMapping.source);
          }

          newMapping.original = {
            line: mapping.originalLine,
            column: mapping.originalColumn
          };

          if (mapping.name != null) {
            newMapping.name = mapping.name;
          }
        }

        generator.addMapping(newMapping);
      });
      aSourceMapConsumer.sources.forEach(function (sourceFile) {
        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
        if (content != null) {
          generator.setSourceContent(sourceFile, content);
        }
      });
      return generator;
    };

  /**
   * Add a single mapping from original source line and column to the generated
   * source's line and column for this source map being created. The mapping
   * object should have the following properties:
   *
   *   - generated: An object with the generated line and column positions.
   *   - original: An object with the original line and column positions.
   *   - source: The original source file (relative to the sourceRoot).
   *   - name: An optional original token name for this mapping.
   */
  SourceMapGenerator.prototype.addMapping =
    function SourceMapGenerator_addMapping(aArgs) {
      var generated = util.getArg(aArgs, 'generated');
      var original = util.getArg(aArgs, 'original', null);
      var source = util.getArg(aArgs, 'source', null);
      var name = util.getArg(aArgs, 'name', null);

      if (!this._skipValidation) {
        this._validateMapping(generated, original, source, name);
      }

      if (source != null && !this._sources.has(source)) {
        this._sources.add(source);
      }

      if (name != null && !this._names.has(name)) {
        this._names.add(name);
      }

      this._mappings.add({
        generatedLine: generated.line,
        generatedColumn: generated.column,
        originalLine: original != null && original.line,
        originalColumn: original != null && original.column,
        source: source,
        name: name
      });
    };

  /**
   * Set the source content for a source file.
   */
  SourceMapGenerator.prototype.setSourceContent =
    function SourceMapGenerator_setSourceContent(aSourceFile, aSourceContent) {
      var source = aSourceFile;
      if (this._sourceRoot != null) {
        source = util.relative(this._sourceRoot, source);
      }

      if (aSourceContent != null) {
        // Add the source content to the _sourcesContents map.
        // Create a new _sourcesContents map if the property is null.
        if (!this._sourcesContents) {
          this._sourcesContents = {};
        }
        this._sourcesContents[util.toSetString(source)] = aSourceContent;
      } else if (this._sourcesContents) {
        // Remove the source file from the _sourcesContents map.
        // If the _sourcesContents map is empty, set the property to null.
        delete this._sourcesContents[util.toSetString(source)];
        if (Object.keys(this._sourcesContents).length === 0) {
          this._sourcesContents = null;
        }
      }
    };

  /**
   * Applies the mappings of a sub-source-map for a specific source file to the
   * source map being generated. Each mapping to the supplied source file is
   * rewritten using the supplied source map. Note: The resolution for the
   * resulting mappings is the minimium of this map and the supplied map.
   *
   * @param aSourceMapConsumer The source map to be applied.
   * @param aSourceFile Optional. The filename of the source file.
   *        If omitted, SourceMapConsumer's file property will be used.
   * @param aSourceMapPath Optional. The dirname of the path to the source map
   *        to be applied. If relative, it is relative to the SourceMapConsumer.
   *        This parameter is needed when the two source maps aren't in the same
   *        directory, and the source map to be applied contains relative source
   *        paths. If so, those relative source paths need to be rewritten
   *        relative to the SourceMapGenerator.
   */
  SourceMapGenerator.prototype.applySourceMap =
    function SourceMapGenerator_applySourceMap(aSourceMapConsumer, aSourceFile, aSourceMapPath) {
      var sourceFile = aSourceFile;
      // If aSourceFile is omitted, we will use the file property of the SourceMap
      if (aSourceFile == null) {
        if (aSourceMapConsumer.file == null) {
          throw new Error(
            'SourceMapGenerator.prototype.applySourceMap requires either an explicit source file, ' +
            'or the source map\'s "file" property. Both were omitted.'
          );
        }
        sourceFile = aSourceMapConsumer.file;
      }
      var sourceRoot = this._sourceRoot;
      // Make "sourceFile" relative if an absolute Url is passed.
      if (sourceRoot != null) {
        sourceFile = util.relative(sourceRoot, sourceFile);
      }
      // Applying the SourceMap can add and remove items from the sources and
      // the names array.
      var newSources = new ArraySet();
      var newNames = new ArraySet();

      // Find mappings for the "sourceFile"
      this._mappings.unsortedForEach(function (mapping) {
        if (mapping.source === sourceFile && mapping.originalLine != null) {
          // Check if it can be mapped by the source map, then update the mapping.
          var original = aSourceMapConsumer.originalPositionFor({
            line: mapping.originalLine,
            column: mapping.originalColumn
          });
          if (original.source != null) {
            // Copy mapping
            mapping.source = original.source;
            if (aSourceMapPath != null) {
              mapping.source = util.join(aSourceMapPath, mapping.source)
            }
            if (sourceRoot != null) {
              mapping.source = util.relative(sourceRoot, mapping.source);
            }
            mapping.originalLine = original.line;
            mapping.originalColumn = original.column;
            if (original.name != null) {
              mapping.name = original.name;
            }
          }
        }

        var source = mapping.source;
        if (source != null && !newSources.has(source)) {
          newSources.add(source);
        }

        var name = mapping.name;
        if (name != null && !newNames.has(name)) {
          newNames.add(name);
        }

      }, this);
      this._sources = newSources;
      this._names = newNames;

      // Copy sourcesContents of applied map.
      aSourceMapConsumer.sources.forEach(function (sourceFile) {
        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
        if (content != null) {
          if (aSourceMapPath != null) {
            sourceFile = util.join(aSourceMapPath, sourceFile);
          }
          if (sourceRoot != null) {
            sourceFile = util.relative(sourceRoot, sourceFile);
          }
          this.setSourceContent(sourceFile, content);
        }
      }, this);
    };

  /**
   * A mapping can have one of the three levels of data:
   *
   *   1. Just the generated position.
   *   2. The Generated position, original position, and original source.
   *   3. Generated and original position, original source, as well as a name
   *      token.
   *
   * To maintain consistency, we validate that any new mapping being added falls
   * in to one of these categories.
   */
  SourceMapGenerator.prototype._validateMapping =
    function SourceMapGenerator_validateMapping(aGenerated, aOriginal, aSource,
                                                aName) {
      if (aGenerated && 'line' in aGenerated && 'column' in aGenerated
          && aGenerated.line > 0 && aGenerated.column >= 0
          && !aOriginal && !aSource && !aName) {
        // Case 1.
        return;
      }
      else if (aGenerated && 'line' in aGenerated && 'column' in aGenerated
               && aOriginal && 'line' in aOriginal && 'column' in aOriginal
               && aGenerated.line > 0 && aGenerated.column >= 0
               && aOriginal.line > 0 && aOriginal.column >= 0
               && aSource) {
        // Cases 2 and 3.
        return;
      }
      else {
        throw new Error('Invalid mapping: ' + JSON.stringify({
          generated: aGenerated,
          source: aSource,
          original: aOriginal,
          name: aName
        }));
      }
    };

  /**
   * Serialize the accumulated mappings in to the stream of base 64 VLQs
   * specified by the source map format.
   */
  SourceMapGenerator.prototype._serializeMappings =
    function SourceMapGenerator_serializeMappings() {
      var previousGeneratedColumn = 0;
      var previousGeneratedLine = 1;
      var previousOriginalColumn = 0;
      var previousOriginalLine = 0;
      var previousName = 0;
      var previousSource = 0;
      var result = '';
      var mapping;

      var mappings = this._mappings.toArray();

      for (var i = 0, len = mappings.length; i < len; i++) {
        mapping = mappings[i];

        if (mapping.generatedLine !== previousGeneratedLine) {
          previousGeneratedColumn = 0;
          while (mapping.generatedLine !== previousGeneratedLine) {
            result += ';';
            previousGeneratedLine++;
          }
        }
        else {
          if (i > 0) {
            if (!util.compareByGeneratedPositions(mapping, mappings[i - 1])) {
              continue;
            }
            result += ',';
          }
        }

        result += base64VLQ.encode(mapping.generatedColumn
                                   - previousGeneratedColumn);
        previousGeneratedColumn = mapping.generatedColumn;

        if (mapping.source != null) {
          result += base64VLQ.encode(this._sources.indexOf(mapping.source)
                                     - previousSource);
          previousSource = this._sources.indexOf(mapping.source);

          // lines are stored 0-based in SourceMap spec version 3
          result += base64VLQ.encode(mapping.originalLine - 1
                                     - previousOriginalLine);
          previousOriginalLine = mapping.originalLine - 1;

          result += base64VLQ.encode(mapping.originalColumn
                                     - previousOriginalColumn);
          previousOriginalColumn = mapping.originalColumn;

          if (mapping.name != null) {
            result += base64VLQ.encode(this._names.indexOf(mapping.name)
                                       - previousName);
            previousName = this._names.indexOf(mapping.name);
          }
        }
      }

      return result;
    };

  SourceMapGenerator.prototype._generateSourcesContent =
    function SourceMapGenerator_generateSourcesContent(aSources, aSourceRoot) {
      return aSources.map(function (source) {
        if (!this._sourcesContents) {
          return null;
        }
        if (aSourceRoot != null) {
          source = util.relative(aSourceRoot, source);
        }
        var key = util.toSetString(source);
        return Object.prototype.hasOwnProperty.call(this._sourcesContents,
                                                    key)
          ? this._sourcesContents[key]
          : null;
      }, this);
    };

  /**
   * Externalize the source map.
   */
  SourceMapGenerator.prototype.toJSON =
    function SourceMapGenerator_toJSON() {
      var map = {
        version: this._version,
        sources: this._sources.toArray(),
        names: this._names.toArray(),
        mappings: this._serializeMappings()
      };
      if (this._file != null) {
        map.file = this._file;
      }
      if (this._sourceRoot != null) {
        map.sourceRoot = this._sourceRoot;
      }
      if (this._sourcesContents) {
        map.sourcesContent = this._generateSourcesContent(map.sources, map.sourceRoot);
      }

      return map;
    };

  /**
   * Render the source map being generated to a string.
   */
  SourceMapGenerator.prototype.toString =
    function SourceMapGenerator_toString() {
      return JSON.stringify(this);
    };

  exports.SourceMapGenerator = SourceMapGenerator;

});

},{"./array-set":122,"./base64-vlq":123,"./mapping-list":126,"./util":130,"amdefine":8}],129:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var SourceMapGenerator = require('./source-map-generator').SourceMapGenerator;
  var util = require('./util');

  // Matches a Windows-style `\r\n` newline or a `\n` newline used by all other
  // operating systems these days (capturing the result).
  var REGEX_NEWLINE = /(\r?\n)/;

  // Newline character code for charCodeAt() comparisons
  var NEWLINE_CODE = 10;

  // Private symbol for identifying `SourceNode`s when multiple versions of
  // the source-map library are loaded. This MUST NOT CHANGE across
  // versions!
  var isSourceNode = "$$$isSourceNode$$$";

  /**
   * SourceNodes provide a way to abstract over interpolating/concatenating
   * snippets of generated JavaScript source code while maintaining the line and
   * column information associated with the original source code.
   *
   * @param aLine The original line number.
   * @param aColumn The original column number.
   * @param aSource The original source's filename.
   * @param aChunks Optional. An array of strings which are snippets of
   *        generated JS, or other SourceNodes.
   * @param aName The original identifier.
   */
  function SourceNode(aLine, aColumn, aSource, aChunks, aName) {
    this.children = [];
    this.sourceContents = {};
    this.line = aLine == null ? null : aLine;
    this.column = aColumn == null ? null : aColumn;
    this.source = aSource == null ? null : aSource;
    this.name = aName == null ? null : aName;
    this[isSourceNode] = true;
    if (aChunks != null) this.add(aChunks);
  }

  /**
   * Creates a SourceNode from generated code and a SourceMapConsumer.
   *
   * @param aGeneratedCode The generated code
   * @param aSourceMapConsumer The SourceMap for the generated code
   * @param aRelativePath Optional. The path that relative sources in the
   *        SourceMapConsumer should be relative to.
   */
  SourceNode.fromStringWithSourceMap =
    function SourceNode_fromStringWithSourceMap(aGeneratedCode, aSourceMapConsumer, aRelativePath) {
      // The SourceNode we want to fill with the generated code
      // and the SourceMap
      var node = new SourceNode();

      // All even indices of this array are one line of the generated code,
      // while all odd indices are the newlines between two adjacent lines
      // (since `REGEX_NEWLINE` captures its match).
      // Processed fragments are removed from this array, by calling `shiftNextLine`.
      var remainingLines = aGeneratedCode.split(REGEX_NEWLINE);
      var shiftNextLine = function() {
        var lineContents = remainingLines.shift();
        // The last line of a file might not have a newline.
        var newLine = remainingLines.shift() || "";
        return lineContents + newLine;
      };

      // We need to remember the position of "remainingLines"
      var lastGeneratedLine = 1, lastGeneratedColumn = 0;

      // The generate SourceNodes we need a code range.
      // To extract it current and last mapping is used.
      // Here we store the last mapping.
      var lastMapping = null;

      aSourceMapConsumer.eachMapping(function (mapping) {
        if (lastMapping !== null) {
          // We add the code from "lastMapping" to "mapping":
          // First check if there is a new line in between.
          if (lastGeneratedLine < mapping.generatedLine) {
            var code = "";
            // Associate first line with "lastMapping"
            addMappingWithCode(lastMapping, shiftNextLine());
            lastGeneratedLine++;
            lastGeneratedColumn = 0;
            // The remaining code is added without mapping
          } else {
            // There is no new line in between.
            // Associate the code between "lastGeneratedColumn" and
            // "mapping.generatedColumn" with "lastMapping"
            var nextLine = remainingLines[0];
            var code = nextLine.substr(0, mapping.generatedColumn -
                                          lastGeneratedColumn);
            remainingLines[0] = nextLine.substr(mapping.generatedColumn -
                                                lastGeneratedColumn);
            lastGeneratedColumn = mapping.generatedColumn;
            addMappingWithCode(lastMapping, code);
            // No more remaining code, continue
            lastMapping = mapping;
            return;
          }
        }
        // We add the generated code until the first mapping
        // to the SourceNode without any mapping.
        // Each line is added as separate string.
        while (lastGeneratedLine < mapping.generatedLine) {
          node.add(shiftNextLine());
          lastGeneratedLine++;
        }
        if (lastGeneratedColumn < mapping.generatedColumn) {
          var nextLine = remainingLines[0];
          node.add(nextLine.substr(0, mapping.generatedColumn));
          remainingLines[0] = nextLine.substr(mapping.generatedColumn);
          lastGeneratedColumn = mapping.generatedColumn;
        }
        lastMapping = mapping;
      }, this);
      // We have processed all mappings.
      if (remainingLines.length > 0) {
        if (lastMapping) {
          // Associate the remaining code in the current line with "lastMapping"
          addMappingWithCode(lastMapping, shiftNextLine());
        }
        // and add the remaining lines without any mapping
        node.add(remainingLines.join(""));
      }

      // Copy sourcesContent into SourceNode
      aSourceMapConsumer.sources.forEach(function (sourceFile) {
        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
        if (content != null) {
          if (aRelativePath != null) {
            sourceFile = util.join(aRelativePath, sourceFile);
          }
          node.setSourceContent(sourceFile, content);
        }
      });

      return node;

      function addMappingWithCode(mapping, code) {
        if (mapping === null || mapping.source === undefined) {
          node.add(code);
        } else {
          var source = aRelativePath
            ? util.join(aRelativePath, mapping.source)
            : mapping.source;
          node.add(new SourceNode(mapping.originalLine,
                                  mapping.originalColumn,
                                  source,
                                  code,
                                  mapping.name));
        }
      }
    };

  /**
   * Add a chunk of generated JS to this source node.
   *
   * @param aChunk A string snippet of generated JS code, another instance of
   *        SourceNode, or an array where each member is one of those things.
   */
  SourceNode.prototype.add = function SourceNode_add(aChunk) {
    if (Array.isArray(aChunk)) {
      aChunk.forEach(function (chunk) {
        this.add(chunk);
      }, this);
    }
    else if (aChunk[isSourceNode] || typeof aChunk === "string") {
      if (aChunk) {
        this.children.push(aChunk);
      }
    }
    else {
      throw new TypeError(
        "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk
      );
    }
    return this;
  };

  /**
   * Add a chunk of generated JS to the beginning of this source node.
   *
   * @param aChunk A string snippet of generated JS code, another instance of
   *        SourceNode, or an array where each member is one of those things.
   */
  SourceNode.prototype.prepend = function SourceNode_prepend(aChunk) {
    if (Array.isArray(aChunk)) {
      for (var i = aChunk.length-1; i >= 0; i--) {
        this.prepend(aChunk[i]);
      }
    }
    else if (aChunk[isSourceNode] || typeof aChunk === "string") {
      this.children.unshift(aChunk);
    }
    else {
      throw new TypeError(
        "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk
      );
    }
    return this;
  };

  /**
   * Walk over the tree of JS snippets in this node and its children. The
   * walking function is called once for each snippet of JS and is passed that
   * snippet and the its original associated source's line/column location.
   *
   * @param aFn The traversal function.
   */
  SourceNode.prototype.walk = function SourceNode_walk(aFn) {
    var chunk;
    for (var i = 0, len = this.children.length; i < len; i++) {
      chunk = this.children[i];
      if (chunk[isSourceNode]) {
        chunk.walk(aFn);
      }
      else {
        if (chunk !== '') {
          aFn(chunk, { source: this.source,
                       line: this.line,
                       column: this.column,
                       name: this.name });
        }
      }
    }
  };

  /**
   * Like `String.prototype.join` except for SourceNodes. Inserts `aStr` between
   * each of `this.children`.
   *
   * @param aSep The separator.
   */
  SourceNode.prototype.join = function SourceNode_join(aSep) {
    var newChildren;
    var i;
    var len = this.children.length;
    if (len > 0) {
      newChildren = [];
      for (i = 0; i < len-1; i++) {
        newChildren.push(this.children[i]);
        newChildren.push(aSep);
      }
      newChildren.push(this.children[i]);
      this.children = newChildren;
    }
    return this;
  };

  /**
   * Call String.prototype.replace on the very right-most source snippet. Useful
   * for trimming whitespace from the end of a source node, etc.
   *
   * @param aPattern The pattern to replace.
   * @param aReplacement The thing to replace the pattern with.
   */
  SourceNode.prototype.replaceRight = function SourceNode_replaceRight(aPattern, aReplacement) {
    var lastChild = this.children[this.children.length - 1];
    if (lastChild[isSourceNode]) {
      lastChild.replaceRight(aPattern, aReplacement);
    }
    else if (typeof lastChild === 'string') {
      this.children[this.children.length - 1] = lastChild.replace(aPattern, aReplacement);
    }
    else {
      this.children.push(''.replace(aPattern, aReplacement));
    }
    return this;
  };

  /**
   * Set the source content for a source file. This will be added to the SourceMapGenerator
   * in the sourcesContent field.
   *
   * @param aSourceFile The filename of the source file
   * @param aSourceContent The content of the source file
   */
  SourceNode.prototype.setSourceContent =
    function SourceNode_setSourceContent(aSourceFile, aSourceContent) {
      this.sourceContents[util.toSetString(aSourceFile)] = aSourceContent;
    };

  /**
   * Walk over the tree of SourceNodes. The walking function is called for each
   * source file content and is passed the filename and source content.
   *
   * @param aFn The traversal function.
   */
  SourceNode.prototype.walkSourceContents =
    function SourceNode_walkSourceContents(aFn) {
      for (var i = 0, len = this.children.length; i < len; i++) {
        if (this.children[i][isSourceNode]) {
          this.children[i].walkSourceContents(aFn);
        }
      }

      var sources = Object.keys(this.sourceContents);
      for (var i = 0, len = sources.length; i < len; i++) {
        aFn(util.fromSetString(sources[i]), this.sourceContents[sources[i]]);
      }
    };

  /**
   * Return the string representation of this source node. Walks over the tree
   * and concatenates all the various snippets together to one string.
   */
  SourceNode.prototype.toString = function SourceNode_toString() {
    var str = "";
    this.walk(function (chunk) {
      str += chunk;
    });
    return str;
  };

  /**
   * Returns the string representation of this source node along with a source
   * map.
   */
  SourceNode.prototype.toStringWithSourceMap = function SourceNode_toStringWithSourceMap(aArgs) {
    var generated = {
      code: "",
      line: 1,
      column: 0
    };
    var map = new SourceMapGenerator(aArgs);
    var sourceMappingActive = false;
    var lastOriginalSource = null;
    var lastOriginalLine = null;
    var lastOriginalColumn = null;
    var lastOriginalName = null;
    this.walk(function (chunk, original) {
      generated.code += chunk;
      if (original.source !== null
          && original.line !== null
          && original.column !== null) {
        if(lastOriginalSource !== original.source
           || lastOriginalLine !== original.line
           || lastOriginalColumn !== original.column
           || lastOriginalName !== original.name) {
          map.addMapping({
            source: original.source,
            original: {
              line: original.line,
              column: original.column
            },
            generated: {
              line: generated.line,
              column: generated.column
            },
            name: original.name
          });
        }
        lastOriginalSource = original.source;
        lastOriginalLine = original.line;
        lastOriginalColumn = original.column;
        lastOriginalName = original.name;
        sourceMappingActive = true;
      } else if (sourceMappingActive) {
        map.addMapping({
          generated: {
            line: generated.line,
            column: generated.column
          }
        });
        lastOriginalSource = null;
        sourceMappingActive = false;
      }
      for (var idx = 0, length = chunk.length; idx < length; idx++) {
        if (chunk.charCodeAt(idx) === NEWLINE_CODE) {
          generated.line++;
          generated.column = 0;
          // Mappings end at eol
          if (idx + 1 === length) {
            lastOriginalSource = null;
            sourceMappingActive = false;
          } else if (sourceMappingActive) {
            map.addMapping({
              source: original.source,
              original: {
                line: original.line,
                column: original.column
              },
              generated: {
                line: generated.line,
                column: generated.column
              },
              name: original.name
            });
          }
        } else {
          generated.column++;
        }
      }
    });
    this.walkSourceContents(function (sourceFile, sourceContent) {
      map.setSourceContent(sourceFile, sourceContent);
    });

    return { code: generated.code, map: map };
  };

  exports.SourceNode = SourceNode;

});

},{"./source-map-generator":128,"./util":130,"amdefine":8}],130:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  /**
   * This is a helper function for getting values from parameter/options
   * objects.
   *
   * @param args The object we are extracting values from
   * @param name The name of the property we are getting.
   * @param defaultValue An optional value to return if the property is missing
   * from the object. If this is not specified and the property is missing, an
   * error will be thrown.
   */
  function getArg(aArgs, aName, aDefaultValue) {
    if (aName in aArgs) {
      return aArgs[aName];
    } else if (arguments.length === 3) {
      return aDefaultValue;
    } else {
      throw new Error('"' + aName + '" is a required argument.');
    }
  }
  exports.getArg = getArg;

  var urlRegexp = /^(?:([\w+\-.]+):)?\/\/(?:(\w+:\w+)@)?([\w.]*)(?::(\d+))?(\S*)$/;
  var dataUrlRegexp = /^data:.+\,.+$/;

  function urlParse(aUrl) {
    var match = aUrl.match(urlRegexp);
    if (!match) {
      return null;
    }
    return {
      scheme: match[1],
      auth: match[2],
      host: match[3],
      port: match[4],
      path: match[5]
    };
  }
  exports.urlParse = urlParse;

  function urlGenerate(aParsedUrl) {
    var url = '';
    if (aParsedUrl.scheme) {
      url += aParsedUrl.scheme + ':';
    }
    url += '//';
    if (aParsedUrl.auth) {
      url += aParsedUrl.auth + '@';
    }
    if (aParsedUrl.host) {
      url += aParsedUrl.host;
    }
    if (aParsedUrl.port) {
      url += ":" + aParsedUrl.port
    }
    if (aParsedUrl.path) {
      url += aParsedUrl.path;
    }
    return url;
  }
  exports.urlGenerate = urlGenerate;

  /**
   * Normalizes a path, or the path portion of a URL:
   *
   * - Replaces consequtive slashes with one slash.
   * - Removes unnecessary '.' parts.
   * - Removes unnecessary '<dir>/..' parts.
   *
   * Based on code in the Node.js 'path' core module.
   *
   * @param aPath The path or url to normalize.
   */
  function normalize(aPath) {
    var path = aPath;
    var url = urlParse(aPath);
    if (url) {
      if (!url.path) {
        return aPath;
      }
      path = url.path;
    }
    var isAbsolute = (path.charAt(0) === '/');

    var parts = path.split(/\/+/);
    for (var part, up = 0, i = parts.length - 1; i >= 0; i--) {
      part = parts[i];
      if (part === '.') {
        parts.splice(i, 1);
      } else if (part === '..') {
        up++;
      } else if (up > 0) {
        if (part === '') {
          // The first part is blank if the path is absolute. Trying to go
          // above the root is a no-op. Therefore we can remove all '..' parts
          // directly after the root.
          parts.splice(i + 1, up);
          up = 0;
        } else {
          parts.splice(i, 2);
          up--;
        }
      }
    }
    path = parts.join('/');

    if (path === '') {
      path = isAbsolute ? '/' : '.';
    }

    if (url) {
      url.path = path;
      return urlGenerate(url);
    }
    return path;
  }
  exports.normalize = normalize;

  /**
   * Joins two paths/URLs.
   *
   * @param aRoot The root path or URL.
   * @param aPath The path or URL to be joined with the root.
   *
   * - If aPath is a URL or a data URI, aPath is returned, unless aPath is a
   *   scheme-relative URL: Then the scheme of aRoot, if any, is prepended
   *   first.
   * - Otherwise aPath is a path. If aRoot is a URL, then its path portion
   *   is updated with the result and aRoot is returned. Otherwise the result
   *   is returned.
   *   - If aPath is absolute, the result is aPath.
   *   - Otherwise the two paths are joined with a slash.
   * - Joining for example 'http://' and 'www.example.com' is also supported.
   */
  function join(aRoot, aPath) {
    if (aRoot === "") {
      aRoot = ".";
    }
    if (aPath === "") {
      aPath = ".";
    }
    var aPathUrl = urlParse(aPath);
    var aRootUrl = urlParse(aRoot);
    if (aRootUrl) {
      aRoot = aRootUrl.path || '/';
    }

    // `join(foo, '//www.example.org')`
    if (aPathUrl && !aPathUrl.scheme) {
      if (aRootUrl) {
        aPathUrl.scheme = aRootUrl.scheme;
      }
      return urlGenerate(aPathUrl);
    }

    if (aPathUrl || aPath.match(dataUrlRegexp)) {
      return aPath;
    }

    // `join('http://', 'www.example.com')`
    if (aRootUrl && !aRootUrl.host && !aRootUrl.path) {
      aRootUrl.host = aPath;
      return urlGenerate(aRootUrl);
    }

    var joined = aPath.charAt(0) === '/'
      ? aPath
      : normalize(aRoot.replace(/\/+$/, '') + '/' + aPath);

    if (aRootUrl) {
      aRootUrl.path = joined;
      return urlGenerate(aRootUrl);
    }
    return joined;
  }
  exports.join = join;

  /**
   * Make a path relative to a URL or another path.
   *
   * @param aRoot The root path or URL.
   * @param aPath The path or URL to be made relative to aRoot.
   */
  function relative(aRoot, aPath) {
    if (aRoot === "") {
      aRoot = ".";
    }

    aRoot = aRoot.replace(/\/$/, '');

    // XXX: It is possible to remove this block, and the tests still pass!
    var url = urlParse(aRoot);
    if (aPath.charAt(0) == "/" && url && url.path == "/") {
      return aPath.slice(1);
    }

    return aPath.indexOf(aRoot + '/') === 0
      ? aPath.substr(aRoot.length + 1)
      : aPath;
  }
  exports.relative = relative;

  /**
   * Because behavior goes wacky when you set `__proto__` on objects, we
   * have to prefix all the strings in our set with an arbitrary character.
   *
   * See https://github.com/mozilla/source-map/pull/31 and
   * https://github.com/mozilla/source-map/issues/30
   *
   * @param String aStr
   */
  function toSetString(aStr) {
    return '$' + aStr;
  }
  exports.toSetString = toSetString;

  function fromSetString(aStr) {
    return aStr.substr(1);
  }
  exports.fromSetString = fromSetString;

  function strcmp(aStr1, aStr2) {
    var s1 = aStr1 || "";
    var s2 = aStr2 || "";
    return (s1 > s2) - (s1 < s2);
  }

  /**
   * Comparator between two mappings where the original positions are compared.
   *
   * Optionally pass in `true` as `onlyCompareGenerated` to consider two
   * mappings with the same original source/line/column, but different generated
   * line and column the same. Useful when searching for a mapping with a
   * stubbed out mapping.
   */
  function compareByOriginalPositions(mappingA, mappingB, onlyCompareOriginal) {
    var cmp;

    cmp = strcmp(mappingA.source, mappingB.source);
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.originalLine - mappingB.originalLine;
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.originalColumn - mappingB.originalColumn;
    if (cmp || onlyCompareOriginal) {
      return cmp;
    }

    cmp = strcmp(mappingA.name, mappingB.name);
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.generatedLine - mappingB.generatedLine;
    if (cmp) {
      return cmp;
    }

    return mappingA.generatedColumn - mappingB.generatedColumn;
  };
  exports.compareByOriginalPositions = compareByOriginalPositions;

  /**
   * Comparator between two mappings where the generated positions are
   * compared.
   *
   * Optionally pass in `true` as `onlyCompareGenerated` to consider two
   * mappings with the same generated line and column, but different
   * source/name/original line and column the same. Useful when searching for a
   * mapping with a stubbed out mapping.
   */
  function compareByGeneratedPositions(mappingA, mappingB, onlyCompareGenerated) {
    var cmp;

    cmp = mappingA.generatedLine - mappingB.generatedLine;
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.generatedColumn - mappingB.generatedColumn;
    if (cmp || onlyCompareGenerated) {
      return cmp;
    }

    cmp = strcmp(mappingA.source, mappingB.source);
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.originalLine - mappingB.originalLine;
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.originalColumn - mappingB.originalColumn;
    if (cmp) {
      return cmp;
    }

    return strcmp(mappingA.name, mappingB.name);
  };
  exports.compareByGeneratedPositions = compareByGeneratedPositions;

});

},{"amdefine":8}],131:[function(require,module,exports){

/**
 * Expose `debug()` as the module.
 */

module.exports = debug;

/**
 * Create a debugger with the given `name`.
 *
 * @param {String} name
 * @return {Type}
 * @api public
 */

function debug(name) {
  if (!debug.enabled(name)) return function(){};

  return function(fmt){
    fmt = coerce(fmt);

    var curr = new Date;
    var ms = curr - (debug[name] || curr);
    debug[name] = curr;

    fmt = name
      + ' '
      + fmt
      + ' +' + debug.humanize(ms);

    // This hackery is required for IE8
    // where `console.log` doesn't have 'apply'
    window.console
      && console.log
      && Function.prototype.apply.call(console.log, console, arguments);
  }
}

/**
 * The currently active debug mode names.
 */

debug.names = [];
debug.skips = [];

/**
 * Enables a debug mode by name. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} name
 * @api public
 */

debug.enable = function(name) {
  try {
    localStorage.debug = name;
  } catch(e){}

  var split = (name || '').split(/[\s,]+/)
    , len = split.length;

  for (var i = 0; i < len; i++) {
    name = split[i].replace('*', '.*?');
    if (name[0] === '-') {
      debug.skips.push(new RegExp('^' + name.substr(1) + '$'));
    }
    else {
      debug.names.push(new RegExp('^' + name + '$'));
    }
  }
};

/**
 * Disable debug output.
 *
 * @api public
 */

debug.disable = function(){
  debug.enable('');
};

/**
 * Humanize the given `ms`.
 *
 * @param {Number} m
 * @return {String}
 * @api private
 */

debug.humanize = function(ms) {
  var sec = 1000
    , min = 60 * 1000
    , hour = 60 * min;

  if (ms >= hour) return (ms / hour).toFixed(1) + 'h';
  if (ms >= min) return (ms / min).toFixed(1) + 'm';
  if (ms >= sec) return (ms / sec | 0) + 's';
  return ms + 'ms';
};

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

debug.enabled = function(name) {
  for (var i = 0, len = debug.skips.length; i < len; i++) {
    if (debug.skips[i].test(name)) {
      return false;
    }
  }
  for (var i = 0, len = debug.names.length; i < len; i++) {
    if (debug.names[i].test(name)) {
      return true;
    }
  }
  return false;
};

/**
 * Coerce `val`.
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

// persist

try {
  if (window.localStorage) debug.enable(localStorage.debug);
} catch(e){}

},{}],132:[function(require,module,exports){
(function (process,global){
/*!
 * @overview es6-promise - a tiny implementation of Promises/A+.
 * @copyright Copyright (c) 2014 Yehuda Katz, Tom Dale, Stefan Penner and contributors (Conversion to ES6 API by Jake Archibald)
 * @license   Licensed under MIT license
 *            See https://raw.githubusercontent.com/jakearchibald/es6-promise/master/LICENSE
 * @version   2.3.0
 */

(function() {
    "use strict";
    function lib$es6$promise$utils$$objectOrFunction(x) {
      return typeof x === 'function' || (typeof x === 'object' && x !== null);
    }

    function lib$es6$promise$utils$$isFunction(x) {
      return typeof x === 'function';
    }

    function lib$es6$promise$utils$$isMaybeThenable(x) {
      return typeof x === 'object' && x !== null;
    }

    var lib$es6$promise$utils$$_isArray;
    if (!Array.isArray) {
      lib$es6$promise$utils$$_isArray = function (x) {
        return Object.prototype.toString.call(x) === '[object Array]';
      };
    } else {
      lib$es6$promise$utils$$_isArray = Array.isArray;
    }

    var lib$es6$promise$utils$$isArray = lib$es6$promise$utils$$_isArray;
    var lib$es6$promise$asap$$len = 0;
    var lib$es6$promise$asap$$toString = {}.toString;
    var lib$es6$promise$asap$$vertxNext;
    var lib$es6$promise$asap$$customSchedulerFn;

    var lib$es6$promise$asap$$asap = function asap(callback, arg) {
      lib$es6$promise$asap$$queue[lib$es6$promise$asap$$len] = callback;
      lib$es6$promise$asap$$queue[lib$es6$promise$asap$$len + 1] = arg;
      lib$es6$promise$asap$$len += 2;
      if (lib$es6$promise$asap$$len === 2) {
        // If len is 2, that means that we need to schedule an async flush.
        // If additional callbacks are queued before the queue is flushed, they
        // will be processed by this flush that we are scheduling.
        if (lib$es6$promise$asap$$customSchedulerFn) {
          lib$es6$promise$asap$$customSchedulerFn(lib$es6$promise$asap$$flush);
        } else {
          lib$es6$promise$asap$$scheduleFlush();
        }
      }
    }

    function lib$es6$promise$asap$$setScheduler(scheduleFn) {
      lib$es6$promise$asap$$customSchedulerFn = scheduleFn;
    }

    function lib$es6$promise$asap$$setAsap(asapFn) {
      lib$es6$promise$asap$$asap = asapFn;
    }

    var lib$es6$promise$asap$$browserWindow = (typeof window !== 'undefined') ? window : undefined;
    var lib$es6$promise$asap$$browserGlobal = lib$es6$promise$asap$$browserWindow || {};
    var lib$es6$promise$asap$$BrowserMutationObserver = lib$es6$promise$asap$$browserGlobal.MutationObserver || lib$es6$promise$asap$$browserGlobal.WebKitMutationObserver;
    var lib$es6$promise$asap$$isNode = typeof process !== 'undefined' && {}.toString.call(process) === '[object process]';

    // test for web worker but not in IE10
    var lib$es6$promise$asap$$isWorker = typeof Uint8ClampedArray !== 'undefined' &&
      typeof importScripts !== 'undefined' &&
      typeof MessageChannel !== 'undefined';

    // node
    function lib$es6$promise$asap$$useNextTick() {
      var nextTick = process.nextTick;
      // node version 0.10.x displays a deprecation warning when nextTick is used recursively
      // setImmediate should be used instead instead
      var version = process.versions.node.match(/^(?:(\d+)\.)?(?:(\d+)\.)?(\*|\d+)$/);
      if (Array.isArray(version) && version[1] === '0' && version[2] === '10') {
        nextTick = setImmediate;
      }
      return function() {
        nextTick(lib$es6$promise$asap$$flush);
      };
    }

    // vertx
    function lib$es6$promise$asap$$useVertxTimer() {
      return function() {
        lib$es6$promise$asap$$vertxNext(lib$es6$promise$asap$$flush);
      };
    }

    function lib$es6$promise$asap$$useMutationObserver() {
      var iterations = 0;
      var observer = new lib$es6$promise$asap$$BrowserMutationObserver(lib$es6$promise$asap$$flush);
      var node = document.createTextNode('');
      observer.observe(node, { characterData: true });

      return function() {
        node.data = (iterations = ++iterations % 2);
      };
    }

    // web worker
    function lib$es6$promise$asap$$useMessageChannel() {
      var channel = new MessageChannel();
      channel.port1.onmessage = lib$es6$promise$asap$$flush;
      return function () {
        channel.port2.postMessage(0);
      };
    }

    function lib$es6$promise$asap$$useSetTimeout() {
      return function() {
        setTimeout(lib$es6$promise$asap$$flush, 1);
      };
    }

    var lib$es6$promise$asap$$queue = new Array(1000);
    function lib$es6$promise$asap$$flush() {
      for (var i = 0; i < lib$es6$promise$asap$$len; i+=2) {
        var callback = lib$es6$promise$asap$$queue[i];
        var arg = lib$es6$promise$asap$$queue[i+1];

        callback(arg);

        lib$es6$promise$asap$$queue[i] = undefined;
        lib$es6$promise$asap$$queue[i+1] = undefined;
      }

      lib$es6$promise$asap$$len = 0;
    }

    function lib$es6$promise$asap$$attemptVertex() {
      try {
        var r = require;
        var vertx = r('vertx');
        lib$es6$promise$asap$$vertxNext = vertx.runOnLoop || vertx.runOnContext;
        return lib$es6$promise$asap$$useVertxTimer();
      } catch(e) {
        return lib$es6$promise$asap$$useSetTimeout();
      }
    }

    var lib$es6$promise$asap$$scheduleFlush;
    // Decide what async method to use to triggering processing of queued callbacks:
    if (lib$es6$promise$asap$$isNode) {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$useNextTick();
    } else if (lib$es6$promise$asap$$BrowserMutationObserver) {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$useMutationObserver();
    } else if (lib$es6$promise$asap$$isWorker) {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$useMessageChannel();
    } else if (lib$es6$promise$asap$$browserWindow === undefined && typeof require === 'function') {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$attemptVertex();
    } else {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$useSetTimeout();
    }

    function lib$es6$promise$$internal$$noop() {}

    var lib$es6$promise$$internal$$PENDING   = void 0;
    var lib$es6$promise$$internal$$FULFILLED = 1;
    var lib$es6$promise$$internal$$REJECTED  = 2;

    var lib$es6$promise$$internal$$GET_THEN_ERROR = new lib$es6$promise$$internal$$ErrorObject();

    function lib$es6$promise$$internal$$selfFullfillment() {
      return new TypeError("You cannot resolve a promise with itself");
    }

    function lib$es6$promise$$internal$$cannotReturnOwn() {
      return new TypeError('A promises callback cannot return that same promise.');
    }

    function lib$es6$promise$$internal$$getThen(promise) {
      try {
        return promise.then;
      } catch(error) {
        lib$es6$promise$$internal$$GET_THEN_ERROR.error = error;
        return lib$es6$promise$$internal$$GET_THEN_ERROR;
      }
    }

    function lib$es6$promise$$internal$$tryThen(then, value, fulfillmentHandler, rejectionHandler) {
      try {
        then.call(value, fulfillmentHandler, rejectionHandler);
      } catch(e) {
        return e;
      }
    }

    function lib$es6$promise$$internal$$handleForeignThenable(promise, thenable, then) {
       lib$es6$promise$asap$$asap(function(promise) {
        var sealed = false;
        var error = lib$es6$promise$$internal$$tryThen(then, thenable, function(value) {
          if (sealed) { return; }
          sealed = true;
          if (thenable !== value) {
            lib$es6$promise$$internal$$resolve(promise, value);
          } else {
            lib$es6$promise$$internal$$fulfill(promise, value);
          }
        }, function(reason) {
          if (sealed) { return; }
          sealed = true;

          lib$es6$promise$$internal$$reject(promise, reason);
        }, 'Settle: ' + (promise._label || ' unknown promise'));

        if (!sealed && error) {
          sealed = true;
          lib$es6$promise$$internal$$reject(promise, error);
        }
      }, promise);
    }

    function lib$es6$promise$$internal$$handleOwnThenable(promise, thenable) {
      if (thenable._state === lib$es6$promise$$internal$$FULFILLED) {
        lib$es6$promise$$internal$$fulfill(promise, thenable._result);
      } else if (thenable._state === lib$es6$promise$$internal$$REJECTED) {
        lib$es6$promise$$internal$$reject(promise, thenable._result);
      } else {
        lib$es6$promise$$internal$$subscribe(thenable, undefined, function(value) {
          lib$es6$promise$$internal$$resolve(promise, value);
        }, function(reason) {
          lib$es6$promise$$internal$$reject(promise, reason);
        });
      }
    }

    function lib$es6$promise$$internal$$handleMaybeThenable(promise, maybeThenable) {
      if (maybeThenable.constructor === promise.constructor) {
        lib$es6$promise$$internal$$handleOwnThenable(promise, maybeThenable);
      } else {
        var then = lib$es6$promise$$internal$$getThen(maybeThenable);

        if (then === lib$es6$promise$$internal$$GET_THEN_ERROR) {
          lib$es6$promise$$internal$$reject(promise, lib$es6$promise$$internal$$GET_THEN_ERROR.error);
        } else if (then === undefined) {
          lib$es6$promise$$internal$$fulfill(promise, maybeThenable);
        } else if (lib$es6$promise$utils$$isFunction(then)) {
          lib$es6$promise$$internal$$handleForeignThenable(promise, maybeThenable, then);
        } else {
          lib$es6$promise$$internal$$fulfill(promise, maybeThenable);
        }
      }
    }

    function lib$es6$promise$$internal$$resolve(promise, value) {
      if (promise === value) {
        lib$es6$promise$$internal$$reject(promise, lib$es6$promise$$internal$$selfFullfillment());
      } else if (lib$es6$promise$utils$$objectOrFunction(value)) {
        lib$es6$promise$$internal$$handleMaybeThenable(promise, value);
      } else {
        lib$es6$promise$$internal$$fulfill(promise, value);
      }
    }

    function lib$es6$promise$$internal$$publishRejection(promise) {
      if (promise._onerror) {
        promise._onerror(promise._result);
      }

      lib$es6$promise$$internal$$publish(promise);
    }

    function lib$es6$promise$$internal$$fulfill(promise, value) {
      if (promise._state !== lib$es6$promise$$internal$$PENDING) { return; }

      promise._result = value;
      promise._state = lib$es6$promise$$internal$$FULFILLED;

      if (promise._subscribers.length !== 0) {
        lib$es6$promise$asap$$asap(lib$es6$promise$$internal$$publish, promise);
      }
    }

    function lib$es6$promise$$internal$$reject(promise, reason) {
      if (promise._state !== lib$es6$promise$$internal$$PENDING) { return; }
      promise._state = lib$es6$promise$$internal$$REJECTED;
      promise._result = reason;

      lib$es6$promise$asap$$asap(lib$es6$promise$$internal$$publishRejection, promise);
    }

    function lib$es6$promise$$internal$$subscribe(parent, child, onFulfillment, onRejection) {
      var subscribers = parent._subscribers;
      var length = subscribers.length;

      parent._onerror = null;

      subscribers[length] = child;
      subscribers[length + lib$es6$promise$$internal$$FULFILLED] = onFulfillment;
      subscribers[length + lib$es6$promise$$internal$$REJECTED]  = onRejection;

      if (length === 0 && parent._state) {
        lib$es6$promise$asap$$asap(lib$es6$promise$$internal$$publish, parent);
      }
    }

    function lib$es6$promise$$internal$$publish(promise) {
      var subscribers = promise._subscribers;
      var settled = promise._state;

      if (subscribers.length === 0) { return; }

      var child, callback, detail = promise._result;

      for (var i = 0; i < subscribers.length; i += 3) {
        child = subscribers[i];
        callback = subscribers[i + settled];

        if (child) {
          lib$es6$promise$$internal$$invokeCallback(settled, child, callback, detail);
        } else {
          callback(detail);
        }
      }

      promise._subscribers.length = 0;
    }

    function lib$es6$promise$$internal$$ErrorObject() {
      this.error = null;
    }

    var lib$es6$promise$$internal$$TRY_CATCH_ERROR = new lib$es6$promise$$internal$$ErrorObject();

    function lib$es6$promise$$internal$$tryCatch(callback, detail) {
      try {
        return callback(detail);
      } catch(e) {
        lib$es6$promise$$internal$$TRY_CATCH_ERROR.error = e;
        return lib$es6$promise$$internal$$TRY_CATCH_ERROR;
      }
    }

    function lib$es6$promise$$internal$$invokeCallback(settled, promise, callback, detail) {
      var hasCallback = lib$es6$promise$utils$$isFunction(callback),
          value, error, succeeded, failed;

      if (hasCallback) {
        value = lib$es6$promise$$internal$$tryCatch(callback, detail);

        if (value === lib$es6$promise$$internal$$TRY_CATCH_ERROR) {
          failed = true;
          error = value.error;
          value = null;
        } else {
          succeeded = true;
        }

        if (promise === value) {
          lib$es6$promise$$internal$$reject(promise, lib$es6$promise$$internal$$cannotReturnOwn());
          return;
        }

      } else {
        value = detail;
        succeeded = true;
      }

      if (promise._state !== lib$es6$promise$$internal$$PENDING) {
        // noop
      } else if (hasCallback && succeeded) {
        lib$es6$promise$$internal$$resolve(promise, value);
      } else if (failed) {
        lib$es6$promise$$internal$$reject(promise, error);
      } else if (settled === lib$es6$promise$$internal$$FULFILLED) {
        lib$es6$promise$$internal$$fulfill(promise, value);
      } else if (settled === lib$es6$promise$$internal$$REJECTED) {
        lib$es6$promise$$internal$$reject(promise, value);
      }
    }

    function lib$es6$promise$$internal$$initializePromise(promise, resolver) {
      try {
        resolver(function resolvePromise(value){
          lib$es6$promise$$internal$$resolve(promise, value);
        }, function rejectPromise(reason) {
          lib$es6$promise$$internal$$reject(promise, reason);
        });
      } catch(e) {
        lib$es6$promise$$internal$$reject(promise, e);
      }
    }

    function lib$es6$promise$enumerator$$Enumerator(Constructor, input) {
      var enumerator = this;

      enumerator._instanceConstructor = Constructor;
      enumerator.promise = new Constructor(lib$es6$promise$$internal$$noop);

      if (enumerator._validateInput(input)) {
        enumerator._input     = input;
        enumerator.length     = input.length;
        enumerator._remaining = input.length;

        enumerator._init();

        if (enumerator.length === 0) {
          lib$es6$promise$$internal$$fulfill(enumerator.promise, enumerator._result);
        } else {
          enumerator.length = enumerator.length || 0;
          enumerator._enumerate();
          if (enumerator._remaining === 0) {
            lib$es6$promise$$internal$$fulfill(enumerator.promise, enumerator._result);
          }
        }
      } else {
        lib$es6$promise$$internal$$reject(enumerator.promise, enumerator._validationError());
      }
    }

    lib$es6$promise$enumerator$$Enumerator.prototype._validateInput = function(input) {
      return lib$es6$promise$utils$$isArray(input);
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._validationError = function() {
      return new Error('Array Methods must be provided an Array');
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._init = function() {
      this._result = new Array(this.length);
    };

    var lib$es6$promise$enumerator$$default = lib$es6$promise$enumerator$$Enumerator;

    lib$es6$promise$enumerator$$Enumerator.prototype._enumerate = function() {
      var enumerator = this;

      var length  = enumerator.length;
      var promise = enumerator.promise;
      var input   = enumerator._input;

      for (var i = 0; promise._state === lib$es6$promise$$internal$$PENDING && i < length; i++) {
        enumerator._eachEntry(input[i], i);
      }
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._eachEntry = function(entry, i) {
      var enumerator = this;
      var c = enumerator._instanceConstructor;

      if (lib$es6$promise$utils$$isMaybeThenable(entry)) {
        if (entry.constructor === c && entry._state !== lib$es6$promise$$internal$$PENDING) {
          entry._onerror = null;
          enumerator._settledAt(entry._state, i, entry._result);
        } else {
          enumerator._willSettleAt(c.resolve(entry), i);
        }
      } else {
        enumerator._remaining--;
        enumerator._result[i] = entry;
      }
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._settledAt = function(state, i, value) {
      var enumerator = this;
      var promise = enumerator.promise;

      if (promise._state === lib$es6$promise$$internal$$PENDING) {
        enumerator._remaining--;

        if (state === lib$es6$promise$$internal$$REJECTED) {
          lib$es6$promise$$internal$$reject(promise, value);
        } else {
          enumerator._result[i] = value;
        }
      }

      if (enumerator._remaining === 0) {
        lib$es6$promise$$internal$$fulfill(promise, enumerator._result);
      }
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._willSettleAt = function(promise, i) {
      var enumerator = this;

      lib$es6$promise$$internal$$subscribe(promise, undefined, function(value) {
        enumerator._settledAt(lib$es6$promise$$internal$$FULFILLED, i, value);
      }, function(reason) {
        enumerator._settledAt(lib$es6$promise$$internal$$REJECTED, i, reason);
      });
    };
    function lib$es6$promise$promise$all$$all(entries) {
      return new lib$es6$promise$enumerator$$default(this, entries).promise;
    }
    var lib$es6$promise$promise$all$$default = lib$es6$promise$promise$all$$all;
    function lib$es6$promise$promise$race$$race(entries) {
      /*jshint validthis:true */
      var Constructor = this;

      var promise = new Constructor(lib$es6$promise$$internal$$noop);

      if (!lib$es6$promise$utils$$isArray(entries)) {
        lib$es6$promise$$internal$$reject(promise, new TypeError('You must pass an array to race.'));
        return promise;
      }

      var length = entries.length;

      function onFulfillment(value) {
        lib$es6$promise$$internal$$resolve(promise, value);
      }

      function onRejection(reason) {
        lib$es6$promise$$internal$$reject(promise, reason);
      }

      for (var i = 0; promise._state === lib$es6$promise$$internal$$PENDING && i < length; i++) {
        lib$es6$promise$$internal$$subscribe(Constructor.resolve(entries[i]), undefined, onFulfillment, onRejection);
      }

      return promise;
    }
    var lib$es6$promise$promise$race$$default = lib$es6$promise$promise$race$$race;
    function lib$es6$promise$promise$resolve$$resolve(object) {
      /*jshint validthis:true */
      var Constructor = this;

      if (object && typeof object === 'object' && object.constructor === Constructor) {
        return object;
      }

      var promise = new Constructor(lib$es6$promise$$internal$$noop);
      lib$es6$promise$$internal$$resolve(promise, object);
      return promise;
    }
    var lib$es6$promise$promise$resolve$$default = lib$es6$promise$promise$resolve$$resolve;
    function lib$es6$promise$promise$reject$$reject(reason) {
      /*jshint validthis:true */
      var Constructor = this;
      var promise = new Constructor(lib$es6$promise$$internal$$noop);
      lib$es6$promise$$internal$$reject(promise, reason);
      return promise;
    }
    var lib$es6$promise$promise$reject$$default = lib$es6$promise$promise$reject$$reject;

    var lib$es6$promise$promise$$counter = 0;

    function lib$es6$promise$promise$$needsResolver() {
      throw new TypeError('You must pass a resolver function as the first argument to the promise constructor');
    }

    function lib$es6$promise$promise$$needsNew() {
      throw new TypeError("Failed to construct 'Promise': Please use the 'new' operator, this object constructor cannot be called as a function.");
    }

    var lib$es6$promise$promise$$default = lib$es6$promise$promise$$Promise;
    /**
      Promise objects represent the eventual result of an asynchronous operation. The
      primary way of interacting with a promise is through its `then` method, which
      registers callbacks to receive either a promise's eventual value or the reason
      why the promise cannot be fulfilled.

      Terminology
      -----------

      - `promise` is an object or function with a `then` method whose behavior conforms to this specification.
      - `thenable` is an object or function that defines a `then` method.
      - `value` is any legal JavaScript value (including undefined, a thenable, or a promise).
      - `exception` is a value that is thrown using the throw statement.
      - `reason` is a value that indicates why a promise was rejected.
      - `settled` the final resting state of a promise, fulfilled or rejected.

      A promise can be in one of three states: pending, fulfilled, or rejected.

      Promises that are fulfilled have a fulfillment value and are in the fulfilled
      state.  Promises that are rejected have a rejection reason and are in the
      rejected state.  A fulfillment value is never a thenable.

      Promises can also be said to *resolve* a value.  If this value is also a
      promise, then the original promise's settled state will match the value's
      settled state.  So a promise that *resolves* a promise that rejects will
      itself reject, and a promise that *resolves* a promise that fulfills will
      itself fulfill.


      Basic Usage:
      ------------

      ```js
      var promise = new Promise(function(resolve, reject) {
        // on success
        resolve(value);

        // on failure
        reject(reason);
      });

      promise.then(function(value) {
        // on fulfillment
      }, function(reason) {
        // on rejection
      });
      ```

      Advanced Usage:
      ---------------

      Promises shine when abstracting away asynchronous interactions such as
      `XMLHttpRequest`s.

      ```js
      function getJSON(url) {
        return new Promise(function(resolve, reject){
          var xhr = new XMLHttpRequest();

          xhr.open('GET', url);
          xhr.onreadystatechange = handler;
          xhr.responseType = 'json';
          xhr.setRequestHeader('Accept', 'application/json');
          xhr.send();

          function handler() {
            if (this.readyState === this.DONE) {
              if (this.status === 200) {
                resolve(this.response);
              } else {
                reject(new Error('getJSON: `' + url + '` failed with status: [' + this.status + ']'));
              }
            }
          };
        });
      }

      getJSON('/posts.json').then(function(json) {
        // on fulfillment
      }, function(reason) {
        // on rejection
      });
      ```

      Unlike callbacks, promises are great composable primitives.

      ```js
      Promise.all([
        getJSON('/posts'),
        getJSON('/comments')
      ]).then(function(values){
        values[0] // => postsJSON
        values[1] // => commentsJSON

        return values;
      });
      ```

      @class Promise
      @param {function} resolver
      Useful for tooling.
      @constructor
    */
    function lib$es6$promise$promise$$Promise(resolver) {
      this._id = lib$es6$promise$promise$$counter++;
      this._state = undefined;
      this._result = undefined;
      this._subscribers = [];

      if (lib$es6$promise$$internal$$noop !== resolver) {
        if (!lib$es6$promise$utils$$isFunction(resolver)) {
          lib$es6$promise$promise$$needsResolver();
        }

        if (!(this instanceof lib$es6$promise$promise$$Promise)) {
          lib$es6$promise$promise$$needsNew();
        }

        lib$es6$promise$$internal$$initializePromise(this, resolver);
      }
    }

    lib$es6$promise$promise$$Promise.all = lib$es6$promise$promise$all$$default;
    lib$es6$promise$promise$$Promise.race = lib$es6$promise$promise$race$$default;
    lib$es6$promise$promise$$Promise.resolve = lib$es6$promise$promise$resolve$$default;
    lib$es6$promise$promise$$Promise.reject = lib$es6$promise$promise$reject$$default;
    lib$es6$promise$promise$$Promise._setScheduler = lib$es6$promise$asap$$setScheduler;
    lib$es6$promise$promise$$Promise._setAsap = lib$es6$promise$asap$$setAsap;
    lib$es6$promise$promise$$Promise._asap = lib$es6$promise$asap$$asap;

    lib$es6$promise$promise$$Promise.prototype = {
      constructor: lib$es6$promise$promise$$Promise,

    /**
      The primary way of interacting with a promise is through its `then` method,
      which registers callbacks to receive either a promise's eventual value or the
      reason why the promise cannot be fulfilled.

      ```js
      findUser().then(function(user){
        // user is available
      }, function(reason){
        // user is unavailable, and you are given the reason why
      });
      ```

      Chaining
      --------

      The return value of `then` is itself a promise.  This second, 'downstream'
      promise is resolved with the return value of the first promise's fulfillment
      or rejection handler, or rejected if the handler throws an exception.

      ```js
      findUser().then(function (user) {
        return user.name;
      }, function (reason) {
        return 'default name';
      }).then(function (userName) {
        // If `findUser` fulfilled, `userName` will be the user's name, otherwise it
        // will be `'default name'`
      });

      findUser().then(function (user) {
        throw new Error('Found user, but still unhappy');
      }, function (reason) {
        throw new Error('`findUser` rejected and we're unhappy');
      }).then(function (value) {
        // never reached
      }, function (reason) {
        // if `findUser` fulfilled, `reason` will be 'Found user, but still unhappy'.
        // If `findUser` rejected, `reason` will be '`findUser` rejected and we're unhappy'.
      });
      ```
      If the downstream promise does not specify a rejection handler, rejection reasons will be propagated further downstream.

      ```js
      findUser().then(function (user) {
        throw new PedagogicalException('Upstream error');
      }).then(function (value) {
        // never reached
      }).then(function (value) {
        // never reached
      }, function (reason) {
        // The `PedgagocialException` is propagated all the way down to here
      });
      ```

      Assimilation
      ------------

      Sometimes the value you want to propagate to a downstream promise can only be
      retrieved asynchronously. This can be achieved by returning a promise in the
      fulfillment or rejection handler. The downstream promise will then be pending
      until the returned promise is settled. This is called *assimilation*.

      ```js
      findUser().then(function (user) {
        return findCommentsByAuthor(user);
      }).then(function (comments) {
        // The user's comments are now available
      });
      ```

      If the assimliated promise rejects, then the downstream promise will also reject.

      ```js
      findUser().then(function (user) {
        return findCommentsByAuthor(user);
      }).then(function (comments) {
        // If `findCommentsByAuthor` fulfills, we'll have the value here
      }, function (reason) {
        // If `findCommentsByAuthor` rejects, we'll have the reason here
      });
      ```

      Simple Example
      --------------

      Synchronous Example

      ```javascript
      var result;

      try {
        result = findResult();
        // success
      } catch(reason) {
        // failure
      }
      ```

      Errback Example

      ```js
      findResult(function(result, err){
        if (err) {
          // failure
        } else {
          // success
        }
      });
      ```

      Promise Example;

      ```javascript
      findResult().then(function(result){
        // success
      }, function(reason){
        // failure
      });
      ```

      Advanced Example
      --------------

      Synchronous Example

      ```javascript
      var author, books;

      try {
        author = findAuthor();
        books  = findBooksByAuthor(author);
        // success
      } catch(reason) {
        // failure
      }
      ```

      Errback Example

      ```js

      function foundBooks(books) {

      }

      function failure(reason) {

      }

      findAuthor(function(author, err){
        if (err) {
          failure(err);
          // failure
        } else {
          try {
            findBoooksByAuthor(author, function(books, err) {
              if (err) {
                failure(err);
              } else {
                try {
                  foundBooks(books);
                } catch(reason) {
                  failure(reason);
                }
              }
            });
          } catch(error) {
            failure(err);
          }
          // success
        }
      });
      ```

      Promise Example;

      ```javascript
      findAuthor().
        then(findBooksByAuthor).
        then(function(books){
          // found books
      }).catch(function(reason){
        // something went wrong
      });
      ```

      @method then
      @param {Function} onFulfilled
      @param {Function} onRejected
      Useful for tooling.
      @return {Promise}
    */
      then: function(onFulfillment, onRejection) {
        var parent = this;
        var state = parent._state;

        if (state === lib$es6$promise$$internal$$FULFILLED && !onFulfillment || state === lib$es6$promise$$internal$$REJECTED && !onRejection) {
          return this;
        }

        var child = new this.constructor(lib$es6$promise$$internal$$noop);
        var result = parent._result;

        if (state) {
          var callback = arguments[state - 1];
          lib$es6$promise$asap$$asap(function(){
            lib$es6$promise$$internal$$invokeCallback(state, child, callback, result);
          });
        } else {
          lib$es6$promise$$internal$$subscribe(parent, child, onFulfillment, onRejection);
        }

        return child;
      },

    /**
      `catch` is simply sugar for `then(undefined, onRejection)` which makes it the same
      as the catch block of a try/catch statement.

      ```js
      function findAuthor(){
        throw new Error('couldn't find that author');
      }

      // synchronous
      try {
        findAuthor();
      } catch(reason) {
        // something went wrong
      }

      // async with promises
      findAuthor().catch(function(reason){
        // something went wrong
      });
      ```

      @method catch
      @param {Function} onRejection
      Useful for tooling.
      @return {Promise}
    */
      'catch': function(onRejection) {
        return this.then(null, onRejection);
      }
    };
    function lib$es6$promise$polyfill$$polyfill() {
      var local;

      if (typeof global !== 'undefined') {
          local = global;
      } else if (typeof self !== 'undefined') {
          local = self;
      } else {
          try {
              local = Function('return this')();
          } catch (e) {
              throw new Error('polyfill failed because global object is unavailable in this environment');
          }
      }

      var P = local.Promise;

      if (P && Object.prototype.toString.call(P.resolve()) === '[object Promise]' && !P.cast) {
        return;
      }

      local.Promise = lib$es6$promise$promise$$default;
    }
    var lib$es6$promise$polyfill$$default = lib$es6$promise$polyfill$$polyfill;

    var lib$es6$promise$umd$$ES6Promise = {
      'Promise': lib$es6$promise$promise$$default,
      'polyfill': lib$es6$promise$polyfill$$default
    };

    /* global define:true module:true window: true */
    if (typeof define === 'function' && define['amd']) {
      define(function() { return lib$es6$promise$umd$$ES6Promise; });
    } else if (typeof module !== 'undefined' && module['exports']) {
      module['exports'] = lib$es6$promise$umd$$ES6Promise;
    } else if (typeof this !== 'undefined') {
      this['ES6Promise'] = lib$es6$promise$umd$$ES6Promise;
    }

    lib$es6$promise$polyfill$$default();
}).call(this);


}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"_process":7}],133:[function(require,module,exports){
(function (process){
'use strict';

var fs = require('fs');
var path = require('path');

/**
 * Search for a file in an array of paths
 *
 * Options:
 *
 *   - `path` Paths to search in
 *   - `exclude` Paths to exclude
 *   - `global` Whether to search in `PATH`
 *
 * @param {String} name
 * @param {Object} opts
 * @api public
 */

module.exports = function (name, opts) {
    var file;

    opts = opts || {};
    opts.path = Array.isArray(opts.path) ? opts.path : [opts.path];
    opts.global = opts.global !== false;

    if (opts.global) {
        opts.path = opts.path.concat(process.env.PATH.split(path.delimiter));
    }

    if (opts.exclude) {
        opts.exclude = Array.isArray(opts.exclude) ? opts.exclude : [opts.exclude];
    }

    file = opts.path.map(function (dir) {
        if (dir && opts.exclude) {
            if (dir.indexOf(opts.exclude) === -1) {
                return path.join(dir, name);
            }
        } else if (dir) {
            return path.join(dir, name);
        }
    }).filter(fs.existsSync);

    if (!file.length) {
        return null;
    }

    return file;
};

}).call(this,require('_process'))
},{"_process":7,"fs":1,"path":6}],134:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],135:[function(require,module,exports){
/*
 * $Id: base64.js,v 2.15 2014/04/05 12:58:57 dankogai Exp dankogai $
 *
 *  Licensed under the MIT license.
 *    http://opensource.org/licenses/mit-license
 *
 *  References:
 *    http://en.wikipedia.org/wiki/Base64
 */

(function(global) {
    'use strict';
    // existing version for noConflict()
    var _Base64 = global.Base64;
    var version = "2.1.9";
    // if node.js, we use Buffer
    var buffer;
    if (typeof module !== 'undefined' && module.exports) {
        try {
            buffer = require('buffer').Buffer;
        } catch (err) {}
    }
    // constants
    var b64chars
        = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var b64tab = function(bin) {
        var t = {};
        for (var i = 0, l = bin.length; i < l; i++) t[bin.charAt(i)] = i;
        return t;
    }(b64chars);
    var fromCharCode = String.fromCharCode;
    // encoder stuff
    var cb_utob = function(c) {
        if (c.length < 2) {
            var cc = c.charCodeAt(0);
            return cc < 0x80 ? c
                : cc < 0x800 ? (fromCharCode(0xc0 | (cc >>> 6))
                                + fromCharCode(0x80 | (cc & 0x3f)))
                : (fromCharCode(0xe0 | ((cc >>> 12) & 0x0f))
                   + fromCharCode(0x80 | ((cc >>>  6) & 0x3f))
                   + fromCharCode(0x80 | ( cc         & 0x3f)));
        } else {
            var cc = 0x10000
                + (c.charCodeAt(0) - 0xD800) * 0x400
                + (c.charCodeAt(1) - 0xDC00);
            return (fromCharCode(0xf0 | ((cc >>> 18) & 0x07))
                    + fromCharCode(0x80 | ((cc >>> 12) & 0x3f))
                    + fromCharCode(0x80 | ((cc >>>  6) & 0x3f))
                    + fromCharCode(0x80 | ( cc         & 0x3f)));
        }
    };
    var re_utob = /[\uD800-\uDBFF][\uDC00-\uDFFFF]|[^\x00-\x7F]/g;
    var utob = function(u) {
        return u.replace(re_utob, cb_utob);
    };
    var cb_encode = function(ccc) {
        var padlen = [0, 2, 1][ccc.length % 3],
        ord = ccc.charCodeAt(0) << 16
            | ((ccc.length > 1 ? ccc.charCodeAt(1) : 0) << 8)
            | ((ccc.length > 2 ? ccc.charCodeAt(2) : 0)),
        chars = [
            b64chars.charAt( ord >>> 18),
            b64chars.charAt((ord >>> 12) & 63),
            padlen >= 2 ? '=' : b64chars.charAt((ord >>> 6) & 63),
            padlen >= 1 ? '=' : b64chars.charAt(ord & 63)
        ];
        return chars.join('');
    };
    var btoa = global.btoa ? function(b) {
        return global.btoa(b);
    } : function(b) {
        return b.replace(/[\s\S]{1,3}/g, cb_encode);
    };
    var _encode = buffer ? function (u) {
        return (u.constructor === buffer.constructor ? u : new buffer(u))
        .toString('base64')
    }
    : function (u) { return btoa(utob(u)) }
    ;
    var encode = function(u, urisafe) {
        return !urisafe
            ? _encode(String(u))
            : _encode(String(u)).replace(/[+\/]/g, function(m0) {
                return m0 == '+' ? '-' : '_';
            }).replace(/=/g, '');
    };
    var encodeURI = function(u) { return encode(u, true) };
    // decoder stuff
    var re_btou = new RegExp([
        '[\xC0-\xDF][\x80-\xBF]',
        '[\xE0-\xEF][\x80-\xBF]{2}',
        '[\xF0-\xF7][\x80-\xBF]{3}'
    ].join('|'), 'g');
    var cb_btou = function(cccc) {
        switch(cccc.length) {
        case 4:
            var cp = ((0x07 & cccc.charCodeAt(0)) << 18)
                |    ((0x3f & cccc.charCodeAt(1)) << 12)
                |    ((0x3f & cccc.charCodeAt(2)) <<  6)
                |     (0x3f & cccc.charCodeAt(3)),
            offset = cp - 0x10000;
            return (fromCharCode((offset  >>> 10) + 0xD800)
                    + fromCharCode((offset & 0x3FF) + 0xDC00));
        case 3:
            return fromCharCode(
                ((0x0f & cccc.charCodeAt(0)) << 12)
                    | ((0x3f & cccc.charCodeAt(1)) << 6)
                    |  (0x3f & cccc.charCodeAt(2))
            );
        default:
            return  fromCharCode(
                ((0x1f & cccc.charCodeAt(0)) << 6)
                    |  (0x3f & cccc.charCodeAt(1))
            );
        }
    };
    var btou = function(b) {
        return b.replace(re_btou, cb_btou);
    };
    var cb_decode = function(cccc) {
        var len = cccc.length,
        padlen = len % 4,
        n = (len > 0 ? b64tab[cccc.charAt(0)] << 18 : 0)
            | (len > 1 ? b64tab[cccc.charAt(1)] << 12 : 0)
            | (len > 2 ? b64tab[cccc.charAt(2)] <<  6 : 0)
            | (len > 3 ? b64tab[cccc.charAt(3)]       : 0),
        chars = [
            fromCharCode( n >>> 16),
            fromCharCode((n >>>  8) & 0xff),
            fromCharCode( n         & 0xff)
        ];
        chars.length -= [0, 0, 2, 1][padlen];
        return chars.join('');
    };
    var atob = global.atob ? function(a) {
        return global.atob(a);
    } : function(a){
        return a.replace(/[\s\S]{1,4}/g, cb_decode);
    };
    var _decode = buffer ? function(a) {
        return (a.constructor === buffer.constructor
                ? a : new buffer(a, 'base64')).toString();
    }
    : function(a) { return btou(atob(a)) };
    var decode = function(a){
        return _decode(
            String(a).replace(/[-_]/g, function(m0) { return m0 == '-' ? '+' : '/' })
                .replace(/[^A-Za-z0-9\+\/]/g, '')
        );
    };
    var noConflict = function() {
        var Base64 = global.Base64;
        global.Base64 = _Base64;
        return Base64;
    };
    // export Base64
    global.Base64 = {
        VERSION: version,
        atob: atob,
        btoa: btoa,
        fromBase64: decode,
        toBase64: encode,
        utob: utob,
        encode: encode,
        encodeURI: encodeURI,
        btou: btou,
        decode: decode,
        noConflict: noConflict
    };
    // if ES5 is available, make Base64.extendString() available
    if (typeof Object.defineProperty === 'function') {
        var noEnum = function(v){
            return {value:v,enumerable:false,writable:true,configurable:true};
        };
        global.Base64.extendString = function () {
            Object.defineProperty(
                String.prototype, 'fromBase64', noEnum(function () {
                    return decode(this)
                }));
            Object.defineProperty(
                String.prototype, 'toBase64', noEnum(function (urisafe) {
                    return encode(this, urisafe)
                }));
            Object.defineProperty(
                String.prototype, 'toBase64URI', noEnum(function () {
                    return encode(this, true)
                }));
        };
    }
    // that's it!
    if (global['Meteor']) {
       Base64 = global.Base64; // for normal export in Meteor.js
    }
})(this);

},{"buffer":3}],136:[function(require,module,exports){

var autoprefixer = require('autoprefixer-core');
var calc = require('rework-calc');
var clone = require('clone-component');
var color = require('rework-color-function');
var customMedia = require('rework-custom-media');
var dirname = require('path').dirname;
var fontVariant = require('rework-font-variant');
var hexAlpha = require('rework-hex-alpha');
var importer = require('rework-import');
var postcss = require('postcss');
var rebeccapurple = require('rework-rebeccapurple');
var Rework = require('rework');
var variables = require('rework-vars');

/**
 * Import.
 *
 * @param {Object} options
 *   @param {String} source
 * @return {Function}
 */

exports.import = function(options){
  return 'undefined' == typeof window && options.source
    ? importer()
    : function(){};
};

/**
 * Variables.
 *
 * @param {Object} options
 *   @param {Object} variables
 *   @param {Boolean} preserve
 * @return {Function}
 */

exports.variables = function(options){
  return variables({
    map: options.variables,
    preserve: options.preserve
  });
};

/**
 * Custom media.
 *
 * @param {Object} options
 * @return {Function}
 */

exports.customMedia = function(options){
  return customMedia;
};

/**
 * Hex alpha.
 *
 * @param {Object} options
 * @return {Function}
 */

exports.hexAlpha = function(options){
  return hexAlpha;
};

/**
 * Color.
 *
 * @param {Object} options
 * @return {Function}
 */

exports.color = function(options){
  return color;
};

/**
 * Calc.
 *
 * @param {Object} options
 * @return {Function}
 */

exports.calc = function(options){
  return calc;
};

/**
 * Font variant.
 *
 * @param {Object} options
 * @return {Function}
 */

exports.fontVariant = function(options){
  return fontVariant;
};

/**
 * Rebecca purple.
 *
 * @param {Object} options
 * @return {Function}
 */

exports.rebeccapurple = function(options){
  return rebeccapurple;
};

/**
 * Prefixes.
 *
 * Unfortunately, Autoprefixer uses a different preprocessor, so we have to give
 * it the CSS string and re-parse it again afterwards.
 *
 * @param {Object} options
 *   @param {Array} browsers
 * @return {Function}
 */

exports.prefixes = function(options){
  var opts = clone(options);
  var src = options.source;
  var prefixes = autoprefixer({ browsers: options.browsers });
  var processor = postcss(prefixes);

  return function(stylesheet, rework){
    var str = rework.toString(options);
    var css = processor.process(str, { from: src, to: src }).css;
    // we don't need source mapping the second time reparsing
    delete opts.source;
    rework.obj = Rework(css, opts).obj;
  };
};

},{"autoprefixer-core":11,"clone-component":99,"path":6,"postcss":152,"rework":176,"rework-calc":164,"rework-color-function":165,"rework-custom-media":167,"rework-font-variant":168,"rework-hex-alpha":170,"rework-import":172,"rework-rebeccapurple":173,"rework-vars":174}],137:[function(require,module,exports){

var features = require('./features');
var Rework = require('rework');

/**
 * Expose `myth`.
 */

module.exports = exports = myth;

/**
 * Expose `features`.
 */

exports.features = Object.keys(features);

/**
 * Rework a CSS `string`, or return the Myth rework plugin.
 *
 * @param {String} string (optional)
 * @param {Object} options (optional)
 *   @property {String} source
 *   @property {Array} browsers
 *   @property {Boolean} compress
 *   @property {Object} features
 * @return {String}
 */

function myth(string, options){
  if ('object' == typeof string) options = string, string = null;
  options = options || {};

  if ('string' != typeof string) return plugin(options);

  return Rework(string, options)
    .use(plugin(options))
    .toString(options);
}

/**
 * Generate a Myth rework plugin with `options`.
 *
 * @param {Object} options
 * @return {Function}
 */

function plugin(options){
  return function(stylesheet, rework){
    var enabled = options.features || {};
    exports.features.forEach(function(key){
      if (enabled[key] === false) return;
      var plugin = features[key](options);
      rework.use(plugin);
    });
  };
}

},{"./features":136,"rework":176}],138:[function(require,module,exports){
'use strict'

var abs = Math.abs
var round = Math.round

function almostEq(a, b) {
  return abs(a - b) <= 9.5367432e-7
}

//最大公约数 Greatest Common Divisor
function GCD(a, b) {
  if (almostEq(b, 0)) return a
  return GCD(b, a % b)
}

function findPrecision(n) {
  var e = 1

  while (!almostEq(round(n * e) / e, n)) {
    e *= 10
  }

  return e
}

function num2fraction(num) {
  if (num === 0 || num === '0') return '0'

  if (typeof num === 'string') {
    num = parseFloat(num)
  }


  var precision = findPrecision(num) //精确度
  var number = num * precision
  var gcd = abs(GCD(number, precision))

  //分子
  var numerator = number / gcd
  //分母
  var denominator = precision / gcd

  //分数
  return round(numerator) + '/' + round(denominator)
}

module.exports = num2fraction


},{}],139:[function(require,module,exports){
'use strict';

/**
 * Trim string
 *
 * @param {String} str
 * @api private
 */

function trim(str) {
    str = str
        .replace(/^url\s?\(/, '')
        .replace(/\)$/, '')
        .trim()
        .replace(/^("|\')/, '')
        .replace(/("|\')$/, '');

    return str;
}

/**
 * Get @import statements from a string
 *
 * @param {String} str
 * @api public
 */

module.exports = function (str) {
    var regex = /(?:url\s?\((?:[^)]+)\))|(\'|")(?:.*)\1/gi;
    var ret = {};

    if (!str.match(regex)) {
        throw new Error('Could not find a valid import path in string: ' + str);
    }

    ret.path = trim(str.match(regex).toString());
    ret.condition = str.replace(/(^|\s)@import(\s|$)/gi, '').replace(regex, '').replace(' ', '');
    ret.rule = str;

    return ret;
};

},{}],140:[function(require,module,exports){
'use strict';

exports.__esModule = true;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; }

var _container = require('./container');

var _container2 = _interopRequireDefault(_container);

var AtRule = (function (_Container) {
    function AtRule(defaults) {
        _classCallCheck(this, AtRule);

        _Container.call(this, defaults);
        this.type = 'atrule';
    }

    _inherits(AtRule, _Container);

    AtRule.prototype.stringify = function stringify(builder, semicolon) {
        var name = '@' + this.name;
        var params = this.params ? this.stringifyRaw('params') : '';

        if (typeof this.afterName !== 'undefined') {
            name += this.afterName;
        } else if (params) {
            name += ' ';
        }

        if (this.nodes) {
            this.stringifyBlock(builder, name + params);
        } else {
            var before = this.style('before');
            if (before) builder(before);
            var end = (this.between || '') + (semicolon ? ';' : '');
            builder(name + params + end, this);
        }
    };

    AtRule.prototype.append = function append(child) {
        if (!this.nodes) this.nodes = [];
        return _Container.prototype.append.call(this, child);
    };

    AtRule.prototype.prepend = function prepend(child) {
        if (!this.nodes) this.nodes = [];
        return _Container.prototype.prepend.call(this, child);
    };

    AtRule.prototype.insertBefore = function insertBefore(exist, add) {
        if (!this.nodes) this.nodes = [];
        return _Container.prototype.insertBefore.call(this, exist, add);
    };

    AtRule.prototype.insertAfter = function insertAfter(exist, add) {
        if (!this.nodes) this.nodes = [];
        return _Container.prototype.insertAfter.call(this, exist, add);
    };

    return AtRule;
})(_container2['default']);

exports['default'] = AtRule;
module.exports = exports['default'];
},{"./container":142}],141:[function(require,module,exports){
'use strict';

exports.__esModule = true;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; }

var _node = require('./node');

var _node2 = _interopRequireDefault(_node);

var Comment = (function (_Node) {
    function Comment(defaults) {
        _classCallCheck(this, Comment);

        _Node.call(this, defaults);
        this.type = 'comment';
    }

    _inherits(Comment, _Node);

    Comment.prototype.stringify = function stringify(builder) {
        var before = this.style('before');
        if (before) builder(before);
        var left = this.style('left', 'commentLeft');
        var right = this.style('right', 'commentRight');
        builder('/*' + left + this.text + right + '*/', this);
    };

    return Comment;
})(_node2['default']);

exports['default'] = Comment;
module.exports = exports['default'];
},{"./node":149}],142:[function(require,module,exports){
'use strict';

exports.__esModule = true;

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; }

var _declaration = require('./declaration');

var _declaration2 = _interopRequireDefault(_declaration);

var _comment = require('./comment');

var _comment2 = _interopRequireDefault(_comment);

var _node = require('./node');

var _node2 = _interopRequireDefault(_node);

var Container = (function (_Node) {
    function Container() {
        _classCallCheck(this, Container);

        _Node.apply(this, arguments);
    }

    _inherits(Container, _Node);

    Container.prototype.stringifyContent = function stringifyContent(builder) {
        if (!this.nodes) return;

        var i = undefined,
            last = this.nodes.length - 1;
        while (last > 0) {
            if (this.nodes[last].type !== 'comment') break;
            last -= 1;
        }

        var semicolon = this.style('semicolon');
        for (i = 0; i < this.nodes.length; i++) {
            this.nodes[i].stringify(builder, last !== i || semicolon);
        }
    };

    Container.prototype.stringifyBlock = function stringifyBlock(builder, start) {
        var before = this.style('before');
        if (before) builder(before);

        var between = this.style('between', 'beforeOpen');
        builder(start + between + '{', this, 'start');

        var after = undefined;
        if (this.nodes && this.nodes.length) {
            this.stringifyContent(builder);
            after = this.style('after');
        } else {
            after = this.style('after', 'emptyBody');
        }

        if (after) builder(after);
        builder('}', this, 'end');
    };

    Container.prototype.push = function push(child) {
        child.parent = this;
        this.nodes.push(child);
        return this;
    };

    Container.prototype.each = function each(callback) {
        if (!this.lastEach) this.lastEach = 0;
        if (!this.indexes) this.indexes = {};

        this.lastEach += 1;
        var id = this.lastEach;
        this.indexes[id] = 0;

        if (!this.nodes) return undefined;

        var index = undefined,
            result = undefined;
        while (this.indexes[id] < this.nodes.length) {
            index = this.indexes[id];
            result = callback(this.nodes[index], index);
            if (result === false) break;

            this.indexes[id] += 1;
        }

        delete this.indexes[id];

        if (result === false) return false;
    };

    Container.prototype.eachInside = function eachInside(callback) {
        return this.each(function (child, i) {
            var result = callback(child, i);

            if (result !== false && child.eachInside) {
                result = child.eachInside(callback);
            }

            if (result === false) return result;
        });
    };

    Container.prototype.eachDecl = function eachDecl(prop, callback) {
        if (!callback) {
            callback = prop;
            return this.eachInside(function (child, i) {
                if (child.type === 'decl') {
                    var result = callback(child, i);
                    if (result === false) return result;
                }
            });
        } else if (prop instanceof RegExp) {
            return this.eachInside(function (child, i) {
                if (child.type === 'decl' && prop.test(child.prop)) {
                    var result = callback(child, i);
                    if (result === false) return result;
                }
            });
        } else {
            return this.eachInside(function (child, i) {
                if (child.type === 'decl' && child.prop === prop) {
                    var result = callback(child, i);
                    if (result === false) return result;
                }
            });
        }
    };

    Container.prototype.eachRule = function eachRule(callback) {
        return this.eachInside(function (child, i) {
            if (child.type === 'rule') {
                var result = callback(child, i);
                if (result === false) return result;
            }
        });
    };

    Container.prototype.eachAtRule = function eachAtRule(name, callback) {
        if (!callback) {
            callback = name;
            return this.eachInside(function (child, i) {
                if (child.type === 'atrule') {
                    var result = callback(child, i);
                    if (result === false) return result;
                }
            });
        } else if (name instanceof RegExp) {
            return this.eachInside(function (child, i) {
                if (child.type === 'atrule' && name.test(child.name)) {
                    var result = callback(child, i);
                    if (result === false) return result;
                }
            });
        } else {
            return this.eachInside(function (child, i) {
                if (child.type === 'atrule' && child.name === name) {
                    var result = callback(child, i);
                    if (result === false) return result;
                }
            });
        }
    };

    Container.prototype.eachComment = function eachComment(callback) {
        return this.eachInside(function (child, i) {
            if (child.type === 'comment') {
                var result = callback(child, i);
                if (result === false) return result;
            }
        });
    };

    Container.prototype.append = function append(child) {
        var nodes = this.normalize(child, this.last);
        for (var _iterator = nodes, _isArray = Array.isArray(_iterator), _i = 0, _iterator = _isArray ? _iterator : _iterator[Symbol.iterator]();;) {
            var _ref;

            if (_isArray) {
                if (_i >= _iterator.length) break;
                _ref = _iterator[_i++];
            } else {
                _i = _iterator.next();
                if (_i.done) break;
                _ref = _i.value;
            }

            var node = _ref;
            this.nodes.push(node);
        }return this;
    };

    Container.prototype.prepend = function prepend(child) {
        var nodes = this.normalize(child, this.first, 'prepend').reverse();
        for (var _iterator2 = nodes, _isArray2 = Array.isArray(_iterator2), _i2 = 0, _iterator2 = _isArray2 ? _iterator2 : _iterator2[Symbol.iterator]();;) {
            var _ref2;

            if (_isArray2) {
                if (_i2 >= _iterator2.length) break;
                _ref2 = _iterator2[_i2++];
            } else {
                _i2 = _iterator2.next();
                if (_i2.done) break;
                _ref2 = _i2.value;
            }

            var node = _ref2;
            this.nodes.unshift(node);
        }for (var id in this.indexes) {
            this.indexes[id] = this.indexes[id] + nodes.length;
        }

        return this;
    };

    Container.prototype.insertBefore = function insertBefore(exist, add) {
        exist = this.index(exist);

        var type = exist === 0 ? 'prepend' : false;
        var nodes = this.normalize(add, this.nodes[exist], type).reverse();
        for (var _iterator3 = nodes, _isArray3 = Array.isArray(_iterator3), _i3 = 0, _iterator3 = _isArray3 ? _iterator3 : _iterator3[Symbol.iterator]();;) {
            var _ref3;

            if (_isArray3) {
                if (_i3 >= _iterator3.length) break;
                _ref3 = _iterator3[_i3++];
            } else {
                _i3 = _iterator3.next();
                if (_i3.done) break;
                _ref3 = _i3.value;
            }

            var node = _ref3;
            this.nodes.splice(exist, 0, node);
        }var index = undefined;
        for (var id in this.indexes) {
            index = this.indexes[id];
            if (exist <= index) {
                this.indexes[id] = index + nodes.length;
            }
        }

        return this;
    };

    Container.prototype.insertAfter = function insertAfter(exist, add) {
        exist = this.index(exist);

        var nodes = this.normalize(add, this.nodes[exist]).reverse();
        for (var _iterator4 = nodes, _isArray4 = Array.isArray(_iterator4), _i4 = 0, _iterator4 = _isArray4 ? _iterator4 : _iterator4[Symbol.iterator]();;) {
            var _ref4;

            if (_isArray4) {
                if (_i4 >= _iterator4.length) break;
                _ref4 = _iterator4[_i4++];
            } else {
                _i4 = _iterator4.next();
                if (_i4.done) break;
                _ref4 = _i4.value;
            }

            var node = _ref4;
            this.nodes.splice(exist + 1, 0, node);
        }var index = undefined;
        for (var id in this.indexes) {
            index = this.indexes[id];
            if (exist < index) {
                this.indexes[id] = index + nodes.length;
            }
        }

        return this;
    };

    Container.prototype.remove = function remove(child) {
        child = this.index(child);
        this.nodes[child].parent = undefined;
        this.nodes.splice(child, 1);

        var index = undefined;
        for (var id in this.indexes) {
            index = this.indexes[id];
            if (index >= child) {
                this.indexes[id] = index - 1;
            }
        }

        return this;
    };

    Container.prototype.removeAll = function removeAll() {
        for (var _iterator5 = this.nodes, _isArray5 = Array.isArray(_iterator5), _i5 = 0, _iterator5 = _isArray5 ? _iterator5 : _iterator5[Symbol.iterator]();;) {
            var _ref5;

            if (_isArray5) {
                if (_i5 >= _iterator5.length) break;
                _ref5 = _iterator5[_i5++];
            } else {
                _i5 = _iterator5.next();
                if (_i5.done) break;
                _ref5 = _i5.value;
            }

            var node = _ref5;
            node.parent = undefined;
        }this.nodes = [];
        return this;
    };

    Container.prototype.replaceValues = function replaceValues(regexp, opts, callback) {
        if (!callback) {
            callback = opts;
            opts = {};
        }

        this.eachDecl(function (decl) {
            if (opts.props && opts.props.indexOf(decl.prop) === -1) return;
            if (opts.fast && decl.value.indexOf(opts.fast) === -1) return;

            decl.value = decl.value.replace(regexp, callback);
        });

        return this;
    };

    Container.prototype.every = function every(condition) {
        return this.nodes.every(condition);
    };

    Container.prototype.some = function some(condition) {
        return this.nodes.some(condition);
    };

    Container.prototype.index = function index(child) {
        if (typeof child === 'number') {
            return child;
        } else {
            return this.nodes.indexOf(child);
        }
    };

    Container.prototype.normalize = function normalize(nodes, sample) {
        var _this = this;

        if (typeof nodes === 'string') {
            var parse = require('./parse');
            nodes = parse(nodes).nodes;
        } else if (!Array.isArray(nodes)) {
            if (nodes.type === 'root') {
                nodes = nodes.nodes;
            } else if (nodes.type) {
                nodes = [nodes];
            } else if (nodes.prop) {
                if (typeof nodes.value === 'undefined') {
                    throw new Error('Value field is missed in node creation');
                }
                nodes = [new _declaration2['default'](nodes)];
            } else if (nodes.selector) {
                var Rule = require('./rule');
                nodes = [new Rule(nodes)];
            } else if (nodes.name) {
                var AtRule = require('./at-rule');
                nodes = [new AtRule(nodes)];
            } else if (nodes.text) {
                nodes = [new _comment2['default'](nodes)];
            } else {
                throw new Error('Unknown node type in node creation');
            }
        }

        var processed = nodes.map(function (child) {
            if (child.parent) child = child.clone();
            if (typeof child.before === 'undefined') {
                if (sample && typeof sample.before !== 'undefined') {
                    child.before = sample.before.replace(/[^\s]/g, '');
                }
            }
            child.parent = _this;
            return child;
        });

        return processed;
    };

    _createClass(Container, [{
        key: 'first',
        get: function get() {
            if (!this.nodes) return undefined;
            return this.nodes[0];
        }
    }, {
        key: 'last',
        get: function get() {
            if (!this.nodes) return undefined;
            return this.nodes[this.nodes.length - 1];
        }
    }]);

    return Container;
})(_node2['default']);

exports['default'] = Container;
module.exports = exports['default'];
},{"./at-rule":140,"./comment":141,"./declaration":144,"./node":149,"./parse":150,"./rule":157}],143:[function(require,module,exports){
(function (process){
'use strict';

exports.__esModule = true;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; }

var _warnOnce = require('./warn-once');

var _warnOnce2 = _interopRequireDefault(_warnOnce);

var CssSyntaxError = (function (_SyntaxError) {
    function CssSyntaxError(message, line, column, source, file, plugin) {
        _classCallCheck(this, CssSyntaxError);

        _SyntaxError.call(this, message);
        this.reason = message;

        if (file) this.file = file;
        if (source) this.source = source;
        if (plugin) this.plugin = plugin;
        if (typeof line !== 'undefined' && typeof column !== 'undefined') {
            this.line = line;
            this.column = column;
        }

        this.setMessage();

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, CssSyntaxError);
        }
    }

    _inherits(CssSyntaxError, _SyntaxError);

    CssSyntaxError.prototype.setMessage = function setMessage() {
        this.message = this.plugin ? this.plugin + ': ' : '';
        this.message += this.file ? this.file : '<css input>';
        if (typeof this.line !== 'undefined') {
            this.message += ':' + this.line + ':' + this.column;
        }
        this.message += ': ' + this.reason;
    };

    CssSyntaxError.prototype.showSourceCode = function showSourceCode(color) {
        if (!this.source) return '';

        var num = this.line - 1;
        var lines = this.source.split('\n');

        var prev = num > 0 ? lines[num - 1] + '\n' : '';
        var broken = lines[num];
        var next = num < lines.length - 1 ? '\n' + lines[num + 1] : '';

        var mark = '\n';
        for (var i = 0; i < this.column - 1; i++) {
            mark += ' ';
        }

        if (typeof color === 'undefined' && typeof process !== 'undefined') {
            if (process.stdout && process.env) {
                color = process.stdout.isTTY && !process.env.NODE_DISABLE_COLORS;
            }
        }

        if (color) {
            mark += '\u001b[1;31m^\u001b[0m';
        } else {
            mark += '^';
        }

        return '\n' + prev + broken + mark + next;
    };

    CssSyntaxError.prototype.highlight = function highlight(color) {
        _warnOnce2['default']('CssSyntaxError#highlight is deprecated and will be ' + 'removed in 5.0. Use error.showSourceCode instead.');
        return this.showSourceCode(color).replace(/^\n/, '');
    };

    CssSyntaxError.prototype.setMozillaProps = function setMozillaProps() {
        var sample = Error.call(this, this.message);
        if (sample.columnNumber) this.columnNumber = this.column;
        if (sample.description) this.description = this.message;
        if (sample.lineNumber) this.lineNumber = this.line;
        if (sample.fileName) this.fileName = this.file;
    };

    CssSyntaxError.prototype.toString = function toString() {
        return this.name + ': ' + this.message + this.showSourceCode();
    };

    return CssSyntaxError;
})(SyntaxError);

exports['default'] = CssSyntaxError;

CssSyntaxError.prototype.name = 'CssSyntaxError';
module.exports = exports['default'];
}).call(this,require('_process'))
},{"./warn-once":160,"_process":7}],144:[function(require,module,exports){
'use strict';

exports.__esModule = true;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; }

var _node = require('./node');

var _node2 = _interopRequireDefault(_node);

var Declaration = (function (_Node) {
    function Declaration(defaults) {
        _classCallCheck(this, Declaration);

        _Node.call(this, defaults);
        this.type = 'decl';
    }

    _inherits(Declaration, _Node);

    Declaration.prototype.stringify = function stringify(builder, semicolon) {
        var before = this.style('before');
        if (before) builder(before);

        var between = this.style('between', 'colon');
        var string = this.prop + between + this.stringifyRaw('value');

        if (this.important) {
            string += this._important || ' !important';
        }

        if (semicolon) string += ';';
        builder(string, this);
    };

    return Declaration;
})(_node2['default']);

exports['default'] = Declaration;
module.exports = exports['default'];
},{"./node":149}],145:[function(require,module,exports){
'use strict';

exports.__esModule = true;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _cssSyntaxError = require('./css-syntax-error');

var _cssSyntaxError2 = _interopRequireDefault(_cssSyntaxError);

var _previousMap = require('./previous-map');

var _previousMap2 = _interopRequireDefault(_previousMap);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var sequence = 0;

var Input = (function () {
    function Input(css) {
        var opts = arguments[1] === undefined ? {} : arguments[1];

        _classCallCheck(this, Input);

        this.css = css.toString();

        if (this.css[0] === '﻿' || this.css[0] === '￾') {
            this.css = this.css.slice(1);
        }

        this.safe = !!opts.safe;

        if (opts.from) this.file = _path2['default'].resolve(opts.from);

        var map = new _previousMap2['default'](this.css, opts, this.id);
        if (map.text) {
            this.map = map;
            var file = map.consumer().file;
            if (!this.file && file) this.file = this.mapResolve(file);
        }

        if (this.file) {
            this.from = this.file;
        } else {
            sequence += 1;
            this.id = '<input css ' + sequence + '>';
            this.from = this.id;
        }
        if (this.map) this.map.file = this.from;
    }

    Input.prototype.error = function error(message, line, column) {
        var opts = arguments[3] === undefined ? {} : arguments[3];

        var error = new _cssSyntaxError2['default'](message);

        var origin = this.origin(line, column);
        if (origin) {
            error = new _cssSyntaxError2['default'](message, origin.line, origin.column, origin.source, origin.file, opts.plugin);
        } else {
            error = new _cssSyntaxError2['default'](message, line, column, this.css, this.file, opts.plugin);
        }

        error.generated = {
            line: line,
            column: column,
            source: this.css
        };
        if (this.file) error.generated.file = this.file;

        return error;
    };

    Input.prototype.origin = function origin(line, column) {
        if (!this.map) return false;
        var consumer = this.map.consumer();

        var from = consumer.originalPositionFor({ line: line, column: column });
        if (!from.source) return false;

        var result = {
            file: this.mapResolve(from.source),
            line: from.line,
            column: from.column
        };

        var source = consumer.sourceContentFor(result.file);
        if (source) result.source = source;

        return result;
    };

    Input.prototype.mapResolve = function mapResolve(file) {
        return _path2['default'].resolve(this.map.consumer().sourceRoot || '.', file);
    };

    return Input;
})();

exports['default'] = Input;
module.exports = exports['default'];
},{"./css-syntax-error":143,"./previous-map":153,"path":6}],146:[function(require,module,exports){
(function (global){
'use strict';

exports.__esModule = true;

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _mapGenerator = require('./map-generator');

var _mapGenerator2 = _interopRequireDefault(_mapGenerator);

var _warnOnce = require('./warn-once');

var _warnOnce2 = _interopRequireDefault(_warnOnce);

var _result = require('./result');

var _result2 = _interopRequireDefault(_result);

var _parse = require('./parse');

var _parse2 = _interopRequireDefault(_parse);

var _root = require('./root');

var _root2 = _interopRequireDefault(_root);

var Promise = global.Promise || require('es6-promise').Promise;

function isPromise(obj) {
    return typeof obj === 'object' && typeof obj.then === 'function';
}

var LazyResult = (function () {
    function LazyResult(processor, css, opts) {
        _classCallCheck(this, LazyResult);

        this.stringified = false;
        this.processed = false;

        var root = undefined;
        if (css instanceof _root2['default']) {
            root = css;
        } else if (css instanceof LazyResult || css instanceof _result2['default']) {
            root = css.root;
            if (css.map && typeof opts.map === 'undefined') {
                opts.map = { prev: css.map };
            }
        } else {
            try {
                root = _parse2['default'](css, opts);
            } catch (error) {
                this.error = error;
            }
        }

        this.result = new _result2['default'](processor, root, opts);
    }

    LazyResult.prototype.warnings = function warnings() {
        return this.sync().warnings();
    };

    LazyResult.prototype.toString = function toString() {
        return this.css;
    };

    LazyResult.prototype.then = function then(onFulfilled, onRejected) {
        return this.async().then(onFulfilled, onRejected);
    };

    LazyResult.prototype['catch'] = function _catch(onRejected) {
        return this.async()['catch'](onRejected);
    };

    LazyResult.prototype.handleError = function handleError(error, plugin) {
        try {
            this.error = error;
            if (error.name === 'CssSyntaxError' && !error.plugin) {
                error.plugin = plugin.postcssPlugin;
                error.setMessage();
            } else if (plugin.postcssVersion) {
                var pluginName = plugin.postcssPlugin;
                var pluginVer = plugin.postcssVersion;
                var runtimeVer = this.result.processor.version;
                var a = pluginVer.split('.');
                var b = runtimeVer.split('.');

                if (a[0] !== b[0] || parseInt(a[1]) > parseInt(b[1])) {
                    _warnOnce2['default']('Your current PostCSS version is ' + runtimeVer + ', ' + ('but ' + pluginName + ' uses ' + pluginVer + '. Perhaps ') + 'this is the source of the error below.');
                }
            }
        } catch (err) {}
    };

    LazyResult.prototype.asyncTick = function asyncTick(resolve, reject) {
        var _this = this;

        if (this.plugin >= this.processor.plugins.length) {
            this.processed = true;
            return resolve();
        }

        try {
            (function () {
                var plugin = _this.processor.plugins[_this.plugin];
                var promise = _this.run(plugin);
                _this.plugin += 1;

                if (isPromise(promise)) {
                    promise.then(function () {
                        _this.asyncTick(resolve, reject);
                    })['catch'](function (error) {
                        _this.handleError(error, plugin);
                        _this.processed = true;
                        reject(error);
                    });
                } else {
                    _this.asyncTick(resolve, reject);
                }
            })();
        } catch (error) {
            this.processed = true;
            reject(error);
        }
    };

    LazyResult.prototype.async = function async() {
        var _this2 = this;

        if (this.processed) {
            return new Promise(function (resolve, reject) {
                if (_this2.error) {
                    reject(_this2.error);
                } else {
                    resolve(_this2.stringify());
                }
            });
        }
        if (this.processing) {
            return this.processing;
        }

        this.processing = new Promise(function (resolve, reject) {
            if (_this2.error) return reject(_this2.error);
            _this2.plugin = 0;
            _this2.asyncTick(resolve, reject);
        }).then(function () {
            _this2.processed = true;
            return _this2.stringify();
        });

        return this.processing;
    };

    LazyResult.prototype.sync = function sync() {
        if (this.processed) return this.result;
        this.processed = true;

        if (this.processing) {
            throw new Error('Use process(css).then(cb) to work with async plugins');
        }

        if (this.error) throw this.error;

        for (var _iterator = this.result.processor.plugins, _isArray = Array.isArray(_iterator), _i = 0, _iterator = _isArray ? _iterator : _iterator[Symbol.iterator]();;) {
            var _ref;

            if (_isArray) {
                if (_i >= _iterator.length) break;
                _ref = _iterator[_i++];
            } else {
                _i = _iterator.next();
                if (_i.done) break;
                _ref = _i.value;
            }

            var plugin = _ref;

            var promise = this.run(plugin);
            if (isPromise(promise)) {
                throw new Error('Use process(css).then(cb) to work with async plugins');
            }
        }

        return this.result;
    };

    LazyResult.prototype.run = function run(plugin) {
        this.result.lastPlugin = plugin;

        var returned = undefined;
        try {
            returned = plugin(this.result.root, this.result);
        } catch (error) {
            this.handleError(error, plugin);
            throw error;
        }

        if (returned instanceof _root2['default']) {
            this.result.root = returned;
        } else {
            return returned;
        }
    };

    LazyResult.prototype.stringify = function stringify() {
        if (this.stringified) return this.result;
        this.stringified = true;

        this.sync();
        var map = new _mapGenerator2['default'](this.result.root, this.result.opts);
        var data = map.generate();
        this.result.css = data[0];
        this.result.map = data[1];

        return this.result;
    };

    _createClass(LazyResult, [{
        key: 'processor',
        get: function get() {
            return this.result.processor;
        }
    }, {
        key: 'opts',
        get: function get() {
            return this.result.opts;
        }
    }, {
        key: 'css',
        get: function get() {
            return this.stringify().css;
        }
    }, {
        key: 'map',
        get: function get() {
            return this.stringify().map;
        }
    }, {
        key: 'root',
        get: function get() {
            return this.sync().root;
        }
    }, {
        key: 'messages',
        get: function get() {
            return this.sync().messages;
        }
    }]);

    return LazyResult;
})();

exports['default'] = LazyResult;
module.exports = exports['default'];

// Prevent hiding events because of error in error handler
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./map-generator":148,"./parse":150,"./result":155,"./root":156,"./warn-once":160,"es6-promise":132}],147:[function(require,module,exports){
'use strict';

exports.__esModule = true;
var list = {

    split: function split(string, separators, last) {
        var array = [];
        var current = '';
        var split = false;

        var func = 0;
        var quote = false;
        var escape = false;

        for (var i = 0; i < string.length; i++) {
            var letter = string[i];

            if (quote) {
                if (escape) {
                    escape = false;
                } else if (letter === '\\') {
                    escape = true;
                } else if (letter === quote) {
                    quote = false;
                }
            } else if (letter === '"' || letter === '\'') {
                quote = letter;
            } else if (letter === '(') {
                func += 1;
            } else if (letter === ')') {
                if (func > 0) func -= 1;
            } else if (func === 0) {
                if (separators.indexOf(letter) !== -1) split = true;
            }

            if (split) {
                if (current !== '') array.push(current.trim());
                current = '';
                split = false;
            } else {
                current += letter;
            }
        }

        if (last || current !== '') array.push(current.trim());
        return array;
    },

    space: function space(string) {
        var spaces = [' ', '\n', '\t'];
        return list.split(string, spaces);
    },

    comma: function comma(string) {
        var comma = ',';
        return list.split(string, [comma], true);
    }

};

exports['default'] = list;
module.exports = exports['default'];
},{}],148:[function(require,module,exports){
'use strict';

exports.__esModule = true;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _jsBase64 = require('js-base64');

var _sourceMap = require('source-map');

var _sourceMap2 = _interopRequireDefault(_sourceMap);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _default = (function () {
    var _class = function _default(root, opts) {
        _classCallCheck(this, _class);

        this.root = root;
        this.opts = opts;
        this.mapOpts = opts.map || {};
    };

    _class.prototype.isMap = function isMap() {
        if (typeof this.opts.map !== 'undefined') {
            return !!this.opts.map;
        } else {
            return this.previous().length > 0;
        }
    };

    _class.prototype.previous = function previous() {
        var _this = this;

        if (!this.previousMaps) {
            this.previousMaps = [];
            this.root.eachInside(function (node) {
                if (node.source && node.source.input.map) {
                    var map = node.source.input.map;
                    if (_this.previousMaps.indexOf(map) === -1) {
                        _this.previousMaps.push(map);
                    }
                }
            });
        }

        return this.previousMaps;
    };

    _class.prototype.isInline = function isInline() {
        if (typeof this.mapOpts.inline !== 'undefined') {
            return this.mapOpts.inline;
        }

        var annotation = this.mapOpts.annotation;
        if (typeof annotation !== 'undefined' && annotation !== true) {
            return false;
        }

        if (this.previous().length) {
            return this.previous().some(function (i) {
                return i.inline;
            });
        } else {
            return true;
        }
    };

    _class.prototype.isSourcesContent = function isSourcesContent() {
        if (typeof this.mapOpts.sourcesContent !== 'undefined') {
            return this.mapOpts.sourcesContent;
        }
        if (this.previous().length) {
            return this.previous().some(function (i) {
                return i.withContent();
            });
        } else {
            return true;
        }
    };

    _class.prototype.clearAnnotation = function clearAnnotation() {
        if (this.mapOpts.annotation === false) return;

        var node = undefined;
        for (var i = this.root.nodes.length - 1; i >= 0; i--) {
            node = this.root.nodes[i];
            if (node.type !== 'comment') continue;
            if (node.text.indexOf('# sourceMappingURL=') === 0) {
                this.root.remove(i);
            }
        }
    };

    _class.prototype.setSourcesContent = function setSourcesContent() {
        var _this2 = this;

        var already = {};
        this.root.eachInside(function (node) {
            if (node.source) {
                var from = node.source.input.from;
                if (from && !already[from]) {
                    already[from] = true;
                    var relative = _this2.relative(from);
                    _this2.map.setSourceContent(relative, node.source.input.css);
                }
            }
        });
    };

    _class.prototype.applyPrevMaps = function applyPrevMaps() {
        for (var _iterator = this.previous(), _isArray = Array.isArray(_iterator), _i = 0, _iterator = _isArray ? _iterator : _iterator[Symbol.iterator]();;) {
            var _ref;

            if (_isArray) {
                if (_i >= _iterator.length) break;
                _ref = _iterator[_i++];
            } else {
                _i = _iterator.next();
                if (_i.done) break;
                _ref = _i.value;
            }

            var prev = _ref;

            var from = this.relative(prev.file);
            var root = prev.root || _path2['default'].dirname(prev.file);
            var map = undefined;

            if (this.mapOpts.sourcesContent === false) {
                map = new _sourceMap2['default'].SourceMapConsumer(prev.text);
                if (map.sourcesContent) {
                    map.sourcesContent = map.sourcesContent.map(function () {
                        return null;
                    });
                }
            } else {
                map = prev.consumer();
            }

            this.map.applySourceMap(map, from, this.relative(root));
        }
    };

    _class.prototype.isAnnotation = function isAnnotation() {
        if (this.isInline()) {
            return true;
        } else if (typeof this.mapOpts.annotation !== 'undefined') {
            return this.mapOpts.annotation;
        } else if (this.previous().length) {
            return this.previous().some(function (i) {
                return i.annotation;
            });
        } else {
            return true;
        }
    };

    _class.prototype.addAnnotation = function addAnnotation() {
        var content = undefined;

        if (this.isInline()) {
            content = 'data:application/json;base64,' + _jsBase64.Base64.encode(this.map.toString());
        } else if (typeof this.mapOpts.annotation === 'string') {
            content = this.mapOpts.annotation;
        } else {
            content = this.outputFile() + '.map';
        }

        this.css += '\n/*# sourceMappingURL=' + content + ' */';
    };

    _class.prototype.outputFile = function outputFile() {
        if (this.opts.to) {
            return this.relative(this.opts.to);
        } else if (this.opts.from) {
            return this.relative(this.opts.from);
        } else {
            return 'to.css';
        }
    };

    _class.prototype.generateMap = function generateMap() {
        this.stringify();
        if (this.isSourcesContent()) this.setSourcesContent();
        if (this.previous().length > 0) this.applyPrevMaps();
        if (this.isAnnotation()) this.addAnnotation();

        if (this.isInline()) {
            return [this.css];
        } else {
            return [this.css, this.map];
        }
    };

    _class.prototype.relative = function relative(file) {
        var from = this.opts.to ? _path2['default'].dirname(this.opts.to) : '.';

        if (typeof this.mapOpts.annotation === 'string') {
            from = _path2['default'].dirname(_path2['default'].resolve(from, this.mapOpts.annotation));
        }

        file = _path2['default'].relative(from, file);
        if (_path2['default'].sep === '\\') {
            return file.replace(/\\/g, '/');
        } else {
            return file;
        }
    };

    _class.prototype.sourcePath = function sourcePath(node) {
        return this.relative(node.source.input.from);
    };

    _class.prototype.stringify = function stringify() {
        var _this3 = this;

        this.css = '';
        this.map = new _sourceMap2['default'].SourceMapGenerator({ file: this.outputFile() });

        var line = 1;
        var column = 1;

        var lines = undefined,
            last = undefined;
        var builder = function builder(str, node, type) {
            _this3.css += str;

            if (node && node.source && node.source.start && type !== 'end') {
                _this3.map.addMapping({
                    source: _this3.sourcePath(node),
                    original: {
                        line: node.source.start.line,
                        column: node.source.start.column - 1
                    },
                    generated: {
                        line: line,
                        column: column - 1
                    }
                });
            }

            lines = str.match(/\n/g);
            if (lines) {
                line += lines.length;
                last = str.lastIndexOf('\n');
                column = str.length - last;
            } else {
                column = column + str.length;
            }

            if (node && node.source && node.source.end && type !== 'start') {
                _this3.map.addMapping({
                    source: _this3.sourcePath(node),
                    original: {
                        line: node.source.end.line,
                        column: node.source.end.column
                    },
                    generated: {
                        line: line,
                        column: column - 1
                    }
                });
            }
        };

        this.root.stringify(builder);
    };

    _class.prototype.generate = function generate() {
        this.clearAnnotation();

        if (this.isMap()) {
            return this.generateMap();
        } else {
            return [this.root.toString()];
        }
    };

    return _class;
})();

exports['default'] = _default;
module.exports = exports['default'];
},{"js-base64":135,"path":6,"source-map":179}],149:[function(require,module,exports){
'use strict';

exports.__esModule = true;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _cssSyntaxError = require('./css-syntax-error');

var _cssSyntaxError2 = _interopRequireDefault(_cssSyntaxError);

var defaultStyle = {
    colon: ': ',
    indent: '    ',
    beforeDecl: '\n',
    beforeRule: '\n',
    beforeOpen: ' ',
    beforeClose: '\n',
    beforeComment: '\n',
    after: '\n',
    emptyBody: '',
    commentLeft: ' ',
    commentRight: ' '
};

var cloneNode = function cloneNode(obj, parent) {
    var cloned = new obj.constructor();

    for (var i in obj) {
        if (!obj.hasOwnProperty(i)) continue;
        var value = obj[i];
        var type = typeof value;

        if (i === 'parent' && type === 'object') {
            if (parent) cloned[i] = parent;
        } else if (i === 'source') {
            cloned[i] = value;
        } else if (value instanceof Array) {
            cloned[i] = value.map(function (j) {
                return cloneNode(j, cloned);
            });
        } else if (i !== 'before' && i !== 'after' && i !== 'between' && i !== 'semicolon') {
            if (type === 'object') value = cloneNode(value);
            cloned[i] = value;
        }
    }

    return cloned;
};

var _default = (function () {
    var _class = function _default() {
        var defaults = arguments[0] === undefined ? {} : arguments[0];

        _classCallCheck(this, _class);

        for (var _name in defaults) {
            this[_name] = defaults[_name];
        }
    };

    _class.prototype.error = function error(message) {
        var opts = arguments[1] === undefined ? {} : arguments[1];

        if (this.source) {
            var pos = this.source.start;
            return this.source.input.error(message, pos.line, pos.column, opts);
        } else {
            return new _cssSyntaxError2['default'](message);
        }
    };

    _class.prototype.removeSelf = function removeSelf() {
        if (this.parent) {
            this.parent.remove(this);
        }
        this.parent = undefined;
        return this;
    };

    _class.prototype.replace = function replace(nodes) {
        this.parent.insertBefore(this, nodes);
        this.parent.remove(this);
        return this;
    };

    _class.prototype.toString = function toString() {
        var result = '';
        var builder = function builder(str) {
            return result += str;
        };
        this.stringify(builder);
        return result;
    };

    _class.prototype.clone = function clone() {
        var overrides = arguments[0] === undefined ? {} : arguments[0];

        var cloned = cloneNode(this);
        for (var _name2 in overrides) {
            cloned[_name2] = overrides[_name2];
        }
        return cloned;
    };

    _class.prototype.cloneBefore = function cloneBefore() {
        var overrides = arguments[0] === undefined ? {} : arguments[0];

        var cloned = this.clone(overrides);
        this.parent.insertBefore(this, cloned);
        return cloned;
    };

    _class.prototype.cloneAfter = function cloneAfter() {
        var overrides = arguments[0] === undefined ? {} : arguments[0];

        var cloned = this.clone(overrides);
        this.parent.insertAfter(this, cloned);
        return cloned;
    };

    _class.prototype.replaceWith = function replaceWith(node) {
        this.parent.insertBefore(this, node);
        this.removeSelf();
        return this;
    };

    _class.prototype.moveTo = function moveTo(container) {
        this.cleanStyles(this.root() === container.root());
        this.removeSelf();
        container.append(this);
        return this;
    };

    _class.prototype.moveBefore = function moveBefore(node) {
        this.cleanStyles(this.root() === node.root());
        this.removeSelf();
        node.parent.insertBefore(node, this);
        return this;
    };

    _class.prototype.moveAfter = function moveAfter(node) {
        this.cleanStyles(this.root() === node.root());
        this.removeSelf();
        node.parent.insertAfter(node, this);
        return this;
    };

    _class.prototype.next = function next() {
        var index = this.parent.index(this);
        return this.parent.nodes[index + 1];
    };

    _class.prototype.prev = function prev() {
        var index = this.parent.index(this);
        return this.parent.nodes[index - 1];
    };

    _class.prototype.toJSON = function toJSON() {
        var fixed = {};

        for (var _name3 in this) {
            if (!this.hasOwnProperty(_name3)) continue;
            if (_name3 === 'parent') continue;
            var value = this[_name3];

            if (value instanceof Array) {
                fixed[_name3] = value.map(function (i) {
                    if (typeof i === 'object' && i.toJSON) {
                        return i.toJSON();
                    } else {
                        return i;
                    }
                });
            } else if (typeof value === 'object' && value.toJSON) {
                fixed[_name3] = value.toJSON();
            } else {
                fixed[_name3] = value;
            }
        }

        return fixed;
    };

    _class.prototype.style = function style(own, detect) {
        var value = undefined;
        if (!detect) detect = own;

        // Already had
        if (own) {
            value = this[own];
            if (typeof value !== 'undefined') return value;
        }

        var parent = this.parent;

        // Hack for first rule in CSS
        if (detect === 'before') {
            if (!parent || parent.type === 'root' && parent.first === this) {
                return '';
            }
        }

        // Floating child without parent
        if (!parent) return defaultStyle[detect];

        // Detect style by other nodes
        var root = this.root();
        if (!root.styleCache) root.styleCache = {};
        if (typeof root.styleCache[detect] !== 'undefined') {
            return root.styleCache[detect];
        }

        if (detect === 'semicolon') {
            root.eachInside(function (i) {
                if (i.nodes && i.nodes.length && i.last.type === 'decl') {
                    value = i.semicolon;
                    if (typeof value !== 'undefined') return false;
                }
            });
        } else if (detect === 'emptyBody') {
            root.eachInside(function (i) {
                if (i.nodes && i.nodes.length === 0) {
                    value = i.after;
                    if (typeof value !== 'undefined') return false;
                }
            });
        } else if (detect === 'indent') {
            root.eachInside(function (i) {
                var p = i.parent;
                if (p && p !== root && p.parent && p.parent === root) {
                    if (typeof i.before !== 'undefined') {
                        var parts = i.before.split('\n');
                        value = parts[parts.length - 1];
                        value = value.replace(/[^\s]/g, '');
                        return false;
                    }
                }
            });
        } else if (detect === 'beforeComment') {
            root.eachComment(function (i) {
                if (typeof i.before !== 'undefined') {
                    value = i.before;
                    if (value.indexOf('\n') !== -1) {
                        value = value.replace(/[^\n]+$/, '');
                    }
                    return false;
                }
            });
            if (typeof value === 'undefined') {
                value = this.style(null, 'beforeDecl');
            }
        } else if (detect === 'beforeDecl') {
            root.eachDecl(function (i) {
                if (typeof i.before !== 'undefined') {
                    value = i.before;
                    if (value.indexOf('\n') !== -1) {
                        value = value.replace(/[^\n]+$/, '');
                    }
                    return false;
                }
            });
            if (typeof value === 'undefined') {
                value = this.style(null, 'beforeRule');
            }
        } else if (detect === 'beforeRule') {
            root.eachInside(function (i) {
                if (i.nodes && (i.parent !== root || root.first !== i)) {
                    if (typeof i.before !== 'undefined') {
                        value = i.before;
                        if (value.indexOf('\n') !== -1) {
                            value = value.replace(/[^\n]+$/, '');
                        }
                        return false;
                    }
                }
            });
        } else if (detect === 'beforeClose') {
            root.eachInside(function (i) {
                if (i.nodes && i.nodes.length > 0) {
                    if (typeof i.after !== 'undefined') {
                        value = i.after;
                        if (value.indexOf('\n') !== -1) {
                            value = value.replace(/[^\n]+$/, '');
                        }
                        return false;
                    }
                }
            });
        } else if (detect === 'before' || detect === 'after') {
            if (this.type === 'decl') {
                value = this.style(null, 'beforeDecl');
            } else if (this.type === 'comment') {
                value = this.style(null, 'beforeComment');
            } else if (detect === 'before') {
                value = this.style(null, 'beforeRule');
            } else {
                value = this.style(null, 'beforeClose');
            }

            var node = this.parent;
            var depth = 0;
            while (node && node.type !== 'root') {
                depth += 1;
                node = node.parent;
            }

            if (value.indexOf('\n') !== -1) {
                var indent = this.style(null, 'indent');
                if (indent.length) {
                    for (var step = 0; step < depth; step++) {
                        value += indent;
                    }
                }
            }

            return value;
        } else if (detect === 'colon') {
            root.eachDecl(function (i) {
                if (typeof i.between !== 'undefined') {
                    value = i.between.replace(/[^\s:]/g, '');
                    return false;
                }
            });
        } else if (detect === 'beforeOpen') {
            root.eachInside(function (i) {
                if (i.type !== 'decl') {
                    value = i.between;
                    if (typeof value !== 'undefined') return false;
                }
            });
        } else {
            root.eachInside(function (i) {
                value = i[own];
                if (typeof value !== 'undefined') return false;
            });
        }

        if (typeof value === 'undefined') value = defaultStyle[detect];

        root.styleCache[detect] = value;
        return value;
    };

    _class.prototype.root = function root() {
        var result = this;
        while (result.parent) result = result.parent;
        return result;
    };

    _class.prototype.cleanStyles = function cleanStyles(keepBetween) {
        delete this.before;
        delete this.after;
        if (!keepBetween) delete this.between;

        if (this.nodes) {
            for (var _iterator = this.nodes, _isArray = Array.isArray(_iterator), _i = 0, _iterator = _isArray ? _iterator : _iterator[Symbol.iterator]();;) {
                var _ref;

                if (_isArray) {
                    if (_i >= _iterator.length) break;
                    _ref = _iterator[_i++];
                } else {
                    _i = _iterator.next();
                    if (_i.done) break;
                    _ref = _i.value;
                }

                var node = _ref;
                node.cleanStyles(keepBetween);
            }
        }
    };

    _class.prototype.stringifyRaw = function stringifyRaw(prop) {
        var value = this[prop];
        var raw = this['_' + prop];
        if (raw && raw.value === value) {
            return raw.raw;
        } else {
            return value;
        }
    };

    return _class;
})();

exports['default'] = _default;
module.exports = exports['default'];
},{"./css-syntax-error":143}],150:[function(require,module,exports){
'use strict';

exports.__esModule = true;
exports['default'] = parse;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _parser = require('./parser');

var _parser2 = _interopRequireDefault(_parser);

var _input = require('./input');

var _input2 = _interopRequireDefault(_input);

function parse(css, opts) {
    var input = new _input2['default'](css, opts);

    var parser = new _parser2['default'](input);
    parser.tokenize();
    parser.loop();

    return parser.root;
}

module.exports = exports['default'];
},{"./input":145,"./parser":151}],151:[function(require,module,exports){
'use strict';

exports.__esModule = true;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _declaration = require('./declaration');

var _declaration2 = _interopRequireDefault(_declaration);

var _tokenize = require('./tokenize');

var _tokenize2 = _interopRequireDefault(_tokenize);

var _comment = require('./comment');

var _comment2 = _interopRequireDefault(_comment);

var _atRule = require('./at-rule');

var _atRule2 = _interopRequireDefault(_atRule);

var _root = require('./root');

var _root2 = _interopRequireDefault(_root);

var _rule = require('./rule');

var _rule2 = _interopRequireDefault(_rule);

var Parser = (function () {
    function Parser(input) {
        _classCallCheck(this, Parser);

        this.input = input;

        this.pos = 0;
        this.root = new _root2['default']();
        this.current = this.root;
        this.spaces = '';
        this.semicolon = false;

        this.root.source = { input: input };
        if (input.map) this.root.prevMap = input.map;
    }

    Parser.prototype.tokenize = function tokenize() {
        this.tokens = _tokenize2['default'](this.input);
    };

    Parser.prototype.loop = function loop() {
        var token = undefined;
        while (this.pos < this.tokens.length) {
            token = this.tokens[this.pos];

            switch (token[0]) {
                case 'word':
                case ':':
                    this.word(token);
                    break;

                case '}':
                    this.end(token);
                    break;

                case 'comment':
                    this.comment(token);
                    break;

                case 'at-word':
                    this.atrule(token);
                    break;

                case '{':
                    this.emptyRule(token);
                    break;

                default:
                    this.spaces += token[1];
                    break;
            }

            this.pos += 1;
        }
        this.endFile();
    };

    Parser.prototype.comment = function comment(token) {
        var node = new _comment2['default']();
        this.init(node, token[2], token[3]);
        node.source.end = { line: token[4], column: token[5] };

        var text = token[1].slice(2, -2);
        if (text.match(/^\s*$/)) {
            node.left = text;
            node.text = '';
            node.right = '';
        } else {
            var match = text.match(/^(\s*)([^]*[^\s])(\s*)$/);
            node.left = match[1];
            node.text = match[2];
            node.right = match[3];
        }
    };

    Parser.prototype.emptyRule = function emptyRule(token) {
        var node = new _rule2['default']();
        this.init(node, token[2], token[3]);
        node.between = '';
        node.selector = '';
        this.current = node;
    };

    Parser.prototype.word = function word() {
        var token = undefined;
        var end = false;
        var type = null;
        var colon = false;
        var bracket = null;
        var brackets = 0;

        var start = this.pos;
        this.pos += 1;
        while (this.pos < this.tokens.length) {
            token = this.tokens[this.pos];
            type = token[0];

            if (type === '(') {
                if (!bracket) bracket = token;
                brackets += 1;
            } else if (brackets === 0) {
                if (type === ';') {
                    if (colon) {
                        this.decl(this.tokens.slice(start, this.pos + 1));
                        return;
                    } else {
                        break;
                    }
                } else if (type === '{') {
                    this.rule(this.tokens.slice(start, this.pos + 1));
                    return;
                } else if (type === '}') {
                    this.pos -= 1;
                    end = true;
                    break;
                } else {
                    if (type === ':') colon = true;
                }
            } else if (type === ')') {
                brackets -= 1;
                if (brackets === 0) bracket = null;
            }

            this.pos += 1;
        }
        if (this.pos === this.tokens.length) {
            this.pos -= 1;
            end = true;
        }

        if (brackets > 0 && !this.input.safe) {
            throw this.input.error('Unclosed bracket', bracket[2], bracket[3]);
        }

        if (end && colon) {
            while (this.pos > start) {
                token = this.tokens[this.pos][0];
                if (token !== 'space' && token !== 'comment') break;
                this.pos -= 1;
            }
            this.decl(this.tokens.slice(start, this.pos + 1));
            return;
        }

        if (this.input.safe) {
            var buffer = this.tokens.slice(start, this.pos + 1);
            this.spaces += buffer.map(function (i) {
                return i[1];
            }).join('');
        } else {
            token = this.tokens[start];
            throw this.input.error('Unknown word', token[2], token[3]);
        }
    };

    Parser.prototype.rule = function rule(tokens) {
        tokens.pop();

        var node = new _rule2['default']();
        this.init(node, tokens[0][2], tokens[0][3]);

        node.between = this.spacesFromEnd(tokens);
        this.raw(node, 'selector', tokens);
        this.current = node;
    };

    Parser.prototype.decl = function decl(tokens) {
        var node = new _declaration2['default']();
        this.init(node);

        var last = tokens[tokens.length - 1];
        if (last[0] === ';') {
            this.semicolon = true;
            tokens.pop();
        }
        if (last[4]) {
            node.source.end = { line: last[4], column: last[5] };
        } else {
            node.source.end = { line: last[2], column: last[3] };
        }

        while (tokens[0][0] !== 'word') {
            node.before += tokens.shift()[1];
        }
        node.source.start = { line: tokens[0][2], column: tokens[0][3] };

        node.prop = tokens.shift()[1];
        node.between = '';

        var token = undefined;
        while (tokens.length) {
            token = tokens.shift();

            if (token[0] === ':') {
                node.between += token[1];
                break;
            } else if (token[0] !== 'space' && token[0] !== 'comment') {
                this.unknownWord(node, token, tokens);
            } else {
                node.between += token[1];
            }
        }

        if (node.prop[0] === '_' || node.prop[0] === '*') {
            node.before += node.prop[0];
            node.prop = node.prop.slice(1);
        }
        node.between += this.spacesFromStart(tokens);

        if (this.input.safe) this.checkMissedSemicolon(tokens);

        for (var i = tokens.length - 1; i > 0; i--) {
            token = tokens[i];
            if (token[1] === '!important') {
                node.important = true;
                var string = this.stringFrom(tokens, i);
                string = this.spacesFromEnd(tokens) + string;
                if (string !== ' !important') node._important = string;
                break;
            } else if (token[1] === 'important') {
                var cache = tokens.slice(0);
                var str = '';
                for (var j = i; j > 0; j--) {
                    var type = cache[j][0];
                    if (str.trim().indexOf('!') === 0 && type !== 'space') {
                        break;
                    }
                    str = cache.pop()[1] + str;
                }
                if (str.trim().indexOf('!') === 0) {
                    node.important = true;
                    node._important = str;
                    tokens = cache;
                }
            }

            if (token[0] !== 'space' && token[0] !== 'comment') {
                break;
            }
        }

        this.raw(node, 'value', tokens);

        if (node.value.indexOf(':') !== -1 && !this.input.safe) {
            this.checkMissedSemicolon(tokens);
        }
    };

    Parser.prototype.atrule = function atrule(token) {
        var node = new _atRule2['default']();
        node.name = token[1].slice(1);
        if (node.name === '') {
            if (this.input.safe) {
                node.name = '';
            } else {
                throw this.input.error('At-rule without name', token[2], token[3]);
            }
        }
        this.init(node, token[2], token[3]);

        var last = false;
        var open = false;
        var params = [];

        this.pos += 1;
        while (this.pos < this.tokens.length) {
            token = this.tokens[this.pos];

            if (token[0] === ';') {
                node.source.end = { line: token[2], column: token[3] };
                this.semicolon = true;
                break;
            } else if (token[0] === '{') {
                open = true;
                break;
            } else {
                params.push(token);
            }

            this.pos += 1;
        }
        if (this.pos === this.tokens.length) {
            last = true;
        }

        node.between = this.spacesFromEnd(params);
        if (params.length) {
            node.afterName = this.spacesFromStart(params);
            this.raw(node, 'params', params);
            if (last) {
                token = params[params.length - 1];
                node.source.end = { line: token[4], column: token[5] };
                this.spaces = node.between;
                node.between = '';
            }
        } else {
            node.afterName = '';
            node.params = '';
        }

        if (open) {
            node.nodes = [];
            this.current = node;
        }
    };

    Parser.prototype.end = function end(token) {
        if (this.current.nodes && this.current.nodes.length) {
            this.current.semicolon = this.semicolon;
        }
        this.semicolon = false;

        this.current.after = (this.current.after || '') + this.spaces;
        this.spaces = '';

        if (this.current.parent) {
            this.current.source.end = { line: token[2], column: token[3] };
            this.current = this.current.parent;
        } else if (!this.input.safe) {
            throw this.input.error('Unexpected }', token[2], token[3]);
        } else {
            this.current.after += '}';
        }
    };

    Parser.prototype.endFile = function endFile() {
        if (this.current.parent && !this.input.safe) {
            var pos = this.current.source.start;
            throw this.input.error('Unclosed block', pos.line, pos.column);
        }

        if (this.current.nodes && this.current.nodes.length) {
            this.current.semicolon = this.semicolon;
        }
        this.current.after = (this.current.after || '') + this.spaces;

        while (this.current.parent) {
            this.current = this.current.parent;
            this.current.after = '';
        }
    };

    Parser.prototype.unknownWord = function unknownWord(node, token) {
        if (this.input.safe) {
            node.source.start = { line: token[2], column: token[3] };
            node.before += node.prop + node.between;
            node.prop = token[1];
            node.between = '';
        } else {
            throw this.input.error('Unknown word', token[2], token[3]);
        }
    };

    Parser.prototype.checkMissedSemicolon = function checkMissedSemicolon(tokens) {
        var prev = null;
        var colon = false;
        var brackets = 0;
        var type = undefined,
            token = undefined;
        for (var i = 0; i < tokens.length; i++) {
            token = tokens[i];
            type = token[0];

            if (type === '(') {
                brackets += 1;
            } else if (type === ')') {
                brackets -= 0;
            } else if (brackets === 0 && type === ':') {
                if (!prev && this.input.safe) {
                    continue;
                } else if (!prev) {
                    throw this.input.error('Double colon', token[2], token[3]);
                } else if (prev[0] === 'word' && prev[1] === 'progid') {
                    continue;
                } else {
                    colon = i;
                    break;
                }
            }

            prev = token;
        }

        if (colon === false) return;

        if (this.input.safe) {
            var split = undefined;
            for (split = colon - 1; split >= 0; split--) {
                if (tokens[split][0] === 'word') break;
            }
            for (split -= 1; split >= 0; split--) {
                if (tokens[split][0] !== 'space') {
                    split += 1;
                    break;
                }
            }
            var other = tokens.splice(split, tokens.length - split);
            this.decl(other);
        } else {
            var founded = 0;
            for (var j = colon - 1; j >= 0; j--) {
                token = tokens[j];
                if (token[0] !== 'space') {
                    founded += 1;
                    if (founded === 2) break;
                }
            }
            throw this.input.error('Missed semicolon', token[2], token[3]);
        }
    };

    // Helpers

    Parser.prototype.init = function init(node, line, column) {
        this.current.push(node);

        node.source = { start: { line: line, column: column }, input: this.input };
        node.before = this.spaces;
        this.spaces = '';
        if (node.type !== 'comment') this.semicolon = false;
    };

    Parser.prototype.raw = function raw(node, prop, tokens) {
        var token = undefined;
        var value = '';
        var clean = true;
        for (var _iterator = tokens, _isArray = Array.isArray(_iterator), _i = 0, _iterator = _isArray ? _iterator : _iterator[Symbol.iterator]();;) {
            if (_isArray) {
                if (_i >= _iterator.length) break;
                token = _iterator[_i++];
            } else {
                _i = _iterator.next();
                if (_i.done) break;
                token = _i.value;
            }

            if (token[0] === 'comment') {
                clean = false;
            } else {
                value += token[1];
            }
        }
        if (!clean) {
            var origin = '';
            for (var _iterator2 = tokens, _isArray2 = Array.isArray(_iterator2), _i2 = 0, _iterator2 = _isArray2 ? _iterator2 : _iterator2[Symbol.iterator]();;) {
                if (_isArray2) {
                    if (_i2 >= _iterator2.length) break;
                    token = _iterator2[_i2++];
                } else {
                    _i2 = _iterator2.next();
                    if (_i2.done) break;
                    token = _i2.value;
                }

                origin += token[1];
            }node['_' + prop] = { value: value, raw: origin };
        }
        node[prop] = value;
    };

    Parser.prototype.spacesFromEnd = function spacesFromEnd(tokens) {
        var next = undefined;
        var spaces = '';
        while (tokens.length) {
            next = tokens[tokens.length - 1][0];
            if (next !== 'space' && next !== 'comment') break;
            spaces += tokens.pop()[1];
        }
        return spaces;
    };

    Parser.prototype.spacesFromStart = function spacesFromStart(tokens) {
        var next = undefined;
        var spaces = '';
        while (tokens.length) {
            next = tokens[0][0];
            if (next !== 'space' && next !== 'comment') break;
            spaces += tokens.shift()[1];
        }
        return spaces;
    };

    Parser.prototype.stringFrom = function stringFrom(tokens, from) {
        var result = '';
        for (var i = from; i < tokens.length; i++) {
            result += tokens[i][1];
        }
        tokens.splice(from, tokens.length - from);
        return result;
    };

    return Parser;
})();

exports['default'] = Parser;
module.exports = exports['default'];
},{"./at-rule":140,"./comment":141,"./declaration":144,"./root":156,"./rule":157,"./tokenize":158}],152:[function(require,module,exports){
'use strict';

exports.__esModule = true;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _declaration = require('./declaration');

var _declaration2 = _interopRequireDefault(_declaration);

var _processor = require('./processor');

var _processor2 = _interopRequireDefault(_processor);

var _comment = require('./comment');

var _comment2 = _interopRequireDefault(_comment);

var _atRule = require('./at-rule');

var _atRule2 = _interopRequireDefault(_atRule);

var _vendor = require('./vendor');

var _vendor2 = _interopRequireDefault(_vendor);

var _parse = require('./parse');

var _parse2 = _interopRequireDefault(_parse);

var _list = require('./list');

var _list2 = _interopRequireDefault(_list);

var _rule = require('./rule');

var _rule2 = _interopRequireDefault(_rule);

var _root = require('./root');

var _root2 = _interopRequireDefault(_root);

var postcss = function postcss() {
    for (var _len = arguments.length, plugins = Array(_len), _key = 0; _key < _len; _key++) {
        plugins[_key] = arguments[_key];
    }

    if (plugins.length === 1 && Array.isArray(plugins[0])) {
        plugins = plugins[0];
    }
    return new _processor2['default'](plugins);
};

postcss.plugin = function (name, initializer) {
    var creator = function creator() {
        var transformer = initializer.apply(this, arguments);
        transformer.postcssPlugin = name;
        transformer.postcssVersion = _processor2['default'].prototype.version;
        return transformer;
    };

    creator.postcss = creator();
    return creator;
};

postcss.vendor = _vendor2['default'];

postcss.parse = _parse2['default'];

postcss.list = _list2['default'];

postcss.comment = function (defaults) {
    return new _comment2['default'](defaults);
};
postcss.atRule = function (defaults) {
    return new _atRule2['default'](defaults);
};
postcss.decl = function (defaults) {
    return new _declaration2['default'](defaults);
};
postcss.rule = function (defaults) {
    return new _rule2['default'](defaults);
};
postcss.root = function (defaults) {
    return new _root2['default'](defaults);
};

exports['default'] = postcss;
module.exports = exports['default'];
},{"./at-rule":140,"./comment":141,"./declaration":144,"./list":147,"./parse":150,"./processor":154,"./root":156,"./rule":157,"./vendor":159}],153:[function(require,module,exports){
'use strict';

exports.__esModule = true;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _jsBase64 = require('js-base64');

var _sourceMap = require('source-map');

var _sourceMap2 = _interopRequireDefault(_sourceMap);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var PreviousMap = (function () {
    function PreviousMap(css, opts) {
        _classCallCheck(this, PreviousMap);

        this.loadAnnotation(css);
        this.inline = this.startWith(this.annotation, 'data:');

        var prev = opts.map ? opts.map.prev : undefined;
        var text = this.loadMap(opts.from, prev);
        if (text) this.text = text;
    }

    PreviousMap.prototype.consumer = function consumer() {
        if (!this.consumerCache) {
            this.consumerCache = new _sourceMap2['default'].SourceMapConsumer(this.text);
        }
        return this.consumerCache;
    };

    PreviousMap.prototype.withContent = function withContent() {
        return !!(this.consumer().sourcesContent && this.consumer().sourcesContent.length > 0);
    };

    PreviousMap.prototype.startWith = function startWith(string, start) {
        if (!string) return false;
        return string.substr(0, start.length) === start;
    };

    PreviousMap.prototype.loadAnnotation = function loadAnnotation(css) {
        var match = css.match(/\/\*\s*# sourceMappingURL=(.*)\s*\*\//);
        if (match) this.annotation = match[1].trim();
    };

    PreviousMap.prototype.decodeInline = function decodeInline(text) {
        var utf64 = 'data:application/json;charset=utf-8;base64,';
        var b64 = 'data:application/json;base64,';
        var uri = 'data:application/json,';

        if (this.startWith(text, uri)) {
            return decodeURIComponent(text.substr(uri.length));
        } else if (this.startWith(text, b64)) {
            return _jsBase64.Base64.decode(text.substr(b64.length));
        } else if (this.startWith(text, utf64)) {
            return _jsBase64.Base64.decode(text.substr(utf64.length));
        } else {
            var encoding = text.match(/data:application\/json;([^,]+),/)[1];
            throw new Error('Unsupported source map encoding ' + encoding);
        }
    };

    PreviousMap.prototype.loadMap = function loadMap(file, prev) {
        if (prev === false) return false;

        if (prev) {
            if (typeof prev === 'string') {
                return prev;
            } else if (prev instanceof _sourceMap2['default'].SourceMapConsumer) {
                return _sourceMap2['default'].SourceMapGenerator.fromSourceMap(prev).toString();
            } else if (prev instanceof _sourceMap2['default'].SourceMapGenerator) {
                return prev.toString();
            } else if (typeof prev === 'object' && prev.mappings) {
                return JSON.stringify(prev);
            } else {
                throw new Error('Unsupported previous source map format: ' + prev.toString());
            }
        } else if (this.inline) {
            return this.decodeInline(this.annotation);
        } else if (this.annotation) {
            var map = this.annotation;
            if (file) map = _path2['default'].join(_path2['default'].dirname(file), map);

            this.root = _path2['default'].dirname(map);
            if (_fs2['default'].existsSync && _fs2['default'].existsSync(map)) {
                return _fs2['default'].readFileSync(map, 'utf-8').toString().trim();
            } else {
                return false;
            }
        }
    };

    return PreviousMap;
})();

exports['default'] = PreviousMap;
module.exports = exports['default'];
},{"fs":1,"js-base64":135,"path":6,"source-map":179}],154:[function(require,module,exports){
'use strict';

exports.__esModule = true;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _lazyResult = require('./lazy-result');

var _lazyResult2 = _interopRequireDefault(_lazyResult);

var Processor = (function () {
    function Processor() {
        var plugins = arguments[0] === undefined ? [] : arguments[0];

        _classCallCheck(this, Processor);

        this.plugins = this.normalize(plugins);
    }

    Processor.prototype.use = function use(plugin) {
        this.plugins = this.plugins.concat(this.normalize([plugin]));
        return this;
    };

    Processor.prototype.process = function process(css) {
        var opts = arguments[1] === undefined ? {} : arguments[1];

        return new _lazyResult2['default'](this, css, opts);
    };

    Processor.prototype.normalize = function normalize(plugins) {
        var normalized = [];
        for (var _iterator = plugins, _isArray = Array.isArray(_iterator), _i = 0, _iterator = _isArray ? _iterator : _iterator[Symbol.iterator]();;) {
            var _ref;

            if (_isArray) {
                if (_i >= _iterator.length) break;
                _ref = _iterator[_i++];
            } else {
                _i = _iterator.next();
                if (_i.done) break;
                _ref = _i.value;
            }

            var i = _ref;

            var type = typeof i;
            if ((type === 'object' || type === 'function') && i.postcss) {
                i = i.postcss;
            }

            if (typeof i === 'object' && Array.isArray(i.plugins)) {
                normalized = normalized.concat(i.plugins);
            } else {
                normalized.push(i);
            }
        }
        return normalized;
    };

    return Processor;
})();

exports['default'] = Processor;

Processor.prototype.version = require('../package').version;
module.exports = exports['default'];
},{"../package":162,"./lazy-result":146}],155:[function(require,module,exports){
'use strict';

exports.__esModule = true;

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _warnOnce = require('./warn-once');

var _warnOnce2 = _interopRequireDefault(_warnOnce);

var _warning = require('./warning');

var _warning2 = _interopRequireDefault(_warning);

var Result = (function () {
    function Result(processor, root, opts) {
        _classCallCheck(this, Result);

        this.processor = processor;
        this.messages = [];
        this.root = root;
        this.opts = opts;
        this.css = undefined;
        this.map = undefined;
    }

    Result.prototype.toString = function toString() {
        return this.css;
    };

    Result.prototype.warn = function warn(text) {
        var opts = arguments[1] === undefined ? {} : arguments[1];

        if (!opts.plugin) {
            if (this.lastPlugin && this.lastPlugin.postcssPlugin) {
                opts.plugin = this.lastPlugin.postcssPlugin;
            }
        }

        this.messages.push(new _warning2['default'](text, opts));
    };

    Result.prototype.warnings = function warnings() {
        return this.messages.filter(function (i) {
            return i.type === 'warning';
        });
    };

    _createClass(Result, [{
        key: 'from',
        get: function get() {
            _warnOnce2['default']('result.from is deprecated and will be removed in 5.0. ' + 'Use result.opts.from instead.');
            return this.opts.from;
        }
    }, {
        key: 'to',
        get: function get() {
            _warnOnce2['default']('result.to is deprecated and will be removed in 5.0. ' + 'Use result.opts.to instead.');
            return this.opts.to;
        }
    }]);

    return Result;
})();

exports['default'] = Result;
module.exports = exports['default'];
},{"./warn-once":160,"./warning":161}],156:[function(require,module,exports){
'use strict';

exports.__esModule = true;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; }

var _container = require('./container');

var _container2 = _interopRequireDefault(_container);

var Root = (function (_Container) {
    function Root(defaults) {
        _classCallCheck(this, Root);

        _Container.call(this, defaults);
        if (!this.nodes) this.nodes = [];
        this.type = 'root';
    }

    _inherits(Root, _Container);

    Root.prototype.remove = function remove(child) {
        child = this.index(child);

        if (child === 0 && this.nodes.length > 1) {
            this.nodes[1].before = this.nodes[child].before;
        }

        return _Container.prototype.remove.call(this, child);
    };

    Root.prototype.normalize = function normalize(child, sample, type) {
        var nodes = _Container.prototype.normalize.call(this, child);

        if (sample) {
            if (type === 'prepend') {
                if (this.nodes.length > 1) {
                    sample.before = this.nodes[1].before;
                } else {
                    delete sample.before;
                }
            } else {
                for (var _iterator = nodes, _isArray = Array.isArray(_iterator), _i = 0, _iterator = _isArray ? _iterator : _iterator[Symbol.iterator]();;) {
                    var _ref;

                    if (_isArray) {
                        if (_i >= _iterator.length) break;
                        _ref = _iterator[_i++];
                    } else {
                        _i = _iterator.next();
                        if (_i.done) break;
                        _ref = _i.value;
                    }

                    var node = _ref;

                    if (this.first !== sample) node.before = sample.before;
                }
            }
        }

        return nodes;
    };

    Root.prototype.stringify = function stringify(builder) {
        this.stringifyContent(builder);
        if (this.after) builder(this.after);
    };

    Root.prototype.toResult = function toResult() {
        var opts = arguments[0] === undefined ? {} : arguments[0];

        var LazyResult = require('./lazy-result');
        var Processor = require('./processor');

        var lazy = new LazyResult(new Processor(), this, opts);
        return lazy.stringify();
    };

    return Root;
})(_container2['default']);

exports['default'] = Root;
module.exports = exports['default'];
},{"./container":142,"./lazy-result":146,"./processor":154}],157:[function(require,module,exports){
'use strict';

exports.__esModule = true;

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; }

var _container = require('./container');

var _container2 = _interopRequireDefault(_container);

var _list = require('./list');

var _list2 = _interopRequireDefault(_list);

var Rule = (function (_Container) {
    function Rule(defaults) {
        _classCallCheck(this, Rule);

        _Container.call(this, defaults);
        if (!this.nodes) this.nodes = [];
        this.type = 'rule';
    }

    _inherits(Rule, _Container);

    Rule.prototype.stringify = function stringify(builder) {
        this.stringifyBlock(builder, this.stringifyRaw('selector'));
    };

    _createClass(Rule, [{
        key: 'selectors',
        get: function get() {
            return _list2['default'].comma(this.selector);
        },
        set: function set(values) {
            this.selector = values.join(', ');
        }
    }]);

    return Rule;
})(_container2['default']);

exports['default'] = Rule;
module.exports = exports['default'];
},{"./container":142,"./list":147}],158:[function(require,module,exports){
'use strict';

exports.__esModule = true;
exports['default'] = tokenize;
var SINGLE_QUOTE = 39; // `''
var DOUBLE_QUOTE = 34; // `"'
var BACKSLASH = 92; // `\'
var SLASH = 47; // `/'
var NEWLINE = 10; // `\n'
var SPACE = 32; // ` '
var FEED = 12; // `\f'
var TAB = 9; // `\t'
var CR = 13; // `\r'
var OPEN_PARENTHESES = 40; // `('
var CLOSE_PARENTHESES = 41; // `)'
var OPEN_CURLY = 123; // `{'
var CLOSE_CURLY = 125; // `}'
var SEMICOLON = 59; // `;'
var ASTERICK = 42; // `*'
var COLON = 58; // `:'
var AT = 64; // `@'
var RE_AT_END = /[ \n\t\r\{\(\)'"\\;/]/g;
var RE_WORD_END = /[ \n\t\r\(\)\{\}:;@!'"\\]|\/(?=\*)/g;
var RE_BAD_BRACKET = /.[\\\/\("'\n]/;

function tokenize(input) {
    var tokens = [];
    var css = input.css.valueOf();

    var code = undefined,
        next = undefined,
        quote = undefined,
        lines = undefined,
        last = undefined,
        content = undefined,
        escape = undefined,
        nextLine = undefined,
        nextOffset = undefined,
        escaped = undefined,
        escapePos = undefined;

    var length = css.length;
    var offset = -1;
    var line = 1;
    var pos = 0;

    var unclosed = function unclosed(what, end) {
        if (input.safe) {
            css += end;
            next = css.length - 1;
        } else {
            throw input.error('Unclosed ' + what, line, pos - offset);
        }
    };

    while (pos < length) {
        code = css.charCodeAt(pos);

        if (code === NEWLINE) {
            offset = pos;
            line += 1;
        }

        switch (code) {
            case NEWLINE:
            case SPACE:
            case TAB:
            case CR:
            case FEED:
                next = pos;
                do {
                    next += 1;
                    code = css.charCodeAt(next);
                    if (code === NEWLINE) {
                        offset = next;
                        line += 1;
                    }
                } while (code === SPACE || code === NEWLINE || code === TAB || code === CR || code === FEED);

                tokens.push(['space', css.slice(pos, next)]);
                pos = next - 1;
                break;

            case OPEN_CURLY:
                tokens.push(['{', '{', line, pos - offset]);
                break;

            case CLOSE_CURLY:
                tokens.push(['}', '}', line, pos - offset]);
                break;

            case COLON:
                tokens.push([':', ':', line, pos - offset]);
                break;

            case SEMICOLON:
                tokens.push([';', ';', line, pos - offset]);
                break;

            case OPEN_PARENTHESES:
                next = css.indexOf(')', pos + 1);
                content = css.slice(pos, next + 1);

                if (next === -1 || RE_BAD_BRACKET.test(content)) {
                    tokens.push(['(', '(', line, pos - offset]);
                } else {
                    tokens.push(['brackets', content, line, pos - offset, line, next - offset]);
                    pos = next;
                }

                break;

            case CLOSE_PARENTHESES:
                tokens.push([')', ')', line, pos - offset]);
                break;

            case SINGLE_QUOTE:
            case DOUBLE_QUOTE:
                quote = code === SINGLE_QUOTE ? '\'' : '"';
                next = pos;
                do {
                    escaped = false;
                    next = css.indexOf(quote, next + 1);
                    if (next === -1) unclosed('quote', quote);
                    escapePos = next;
                    while (css.charCodeAt(escapePos - 1) === BACKSLASH) {
                        escapePos -= 1;
                        escaped = !escaped;
                    }
                } while (escaped);

                tokens.push(['string', css.slice(pos, next + 1), line, pos - offset, line, next - offset]);
                pos = next;
                break;

            case AT:
                RE_AT_END.lastIndex = pos + 1;
                RE_AT_END.test(css);
                if (RE_AT_END.lastIndex === 0) {
                    next = css.length - 1;
                } else {
                    next = RE_AT_END.lastIndex - 2;
                }
                tokens.push(['at-word', css.slice(pos, next + 1), line, pos - offset, line, next - offset]);
                pos = next;
                break;

            case BACKSLASH:
                next = pos;
                escape = true;
                while (css.charCodeAt(next + 1) === BACKSLASH) {
                    next += 1;
                    escape = !escape;
                }
                code = css.charCodeAt(next + 1);
                if (escape && (code !== SLASH && code !== SPACE && code !== NEWLINE && code !== TAB && code !== CR && code !== FEED)) {
                    next += 1;
                }
                tokens.push(['word', css.slice(pos, next + 1), line, pos - offset, line, next - offset]);
                pos = next;
                break;

            default:
                if (code === SLASH && css.charCodeAt(pos + 1) === ASTERICK) {
                    next = css.indexOf('*/', pos + 2) + 1;
                    if (next === 0) unclosed('comment', '*/');

                    content = css.slice(pos, next + 1);
                    lines = content.split('\n');
                    last = lines.length - 1;

                    if (last > 0) {
                        nextLine = line + last;
                        nextOffset = next - lines[last].length;
                    } else {
                        nextLine = line;
                        nextOffset = offset;
                    }

                    tokens.push(['comment', content, line, pos - offset, nextLine, next - nextOffset]);

                    offset = nextOffset;
                    line = nextLine;
                    pos = next;
                } else {
                    RE_WORD_END.lastIndex = pos + 1;
                    RE_WORD_END.test(css);
                    if (RE_WORD_END.lastIndex === 0) {
                        next = css.length - 1;
                    } else {
                        next = RE_WORD_END.lastIndex - 2;
                    }

                    tokens.push(['word', css.slice(pos, next + 1), line, pos - offset, line, next - offset]);
                    pos = next;
                }

                break;
        }

        pos++;
    }

    return tokens;
}

module.exports = exports['default'];
},{}],159:[function(require,module,exports){
'use strict';

exports.__esModule = true;
exports['default'] = {

    prefix: function prefix(prop) {
        if (prop[0] === '-') {
            var sep = prop.indexOf('-', 1);
            return prop.substr(0, sep + 1);
        } else {
            return '';
        }
    },

    unprefixed: function unprefixed(prop) {
        if (prop[0] === '-') {
            var sep = prop.indexOf('-', 1);
            return prop.substr(sep + 1);
        } else {
            return prop;
        }
    }

};
module.exports = exports['default'];
},{}],160:[function(require,module,exports){
'use strict';

exports.__esModule = true;
exports['default'] = warnOnce;
var printed = {};

function warnOnce(message) {
    if (printed[message]) return;
    printed[message] = true;

    if (typeof console !== 'undefined' && console.warn) console.warn(message);
}

module.exports = exports['default'];
},{}],161:[function(require,module,exports){
'use strict';

exports.__esModule = true;

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var Warning = (function () {
    function Warning(text) {
        var opts = arguments[1] === undefined ? {} : arguments[1];

        _classCallCheck(this, Warning);

        this.type = 'warning';
        this.text = text;
        for (var opt in opts) {
            this[opt] = opts[opt];
        }
    }

    Warning.prototype.toString = function toString() {
        if (this.node) {
            return this.node.error(this.text, { plugin: this.plugin }).message;
        } else if (this.plugin) {
            return this.plugin + ': ' + this.text;
        } else {
            return this.text;
        }
    };

    return Warning;
})();

exports['default'] = Warning;
module.exports = exports['default'];
},{}],162:[function(require,module,exports){
module.exports={
  "_args": [
    [
      {
        "name": "postcss",
        "raw": "postcss@^4.1.16",
        "rawSpec": "^4.1.16",
        "scope": null,
        "spec": ">=4.1.16 <5.0.0",
        "type": "range"
      },
      "X:\\Programmation\\NodeJS\\web-myth\\node_modules\\myth"
    ]
  ],
  "_from": "postcss@>=4.1.16 <5.0.0",
  "_id": "postcss@4.1.16",
  "_inCache": true,
  "_installable": true,
  "_location": "/postcss",
  "_nodeVersion": "2.3.3",
  "_npmUser": {
    "email": "andrey@sitnik.ru",
    "name": "ai"
  },
  "_npmVersion": "2.11.3",
  "_phantomChildren": {},
  "_requested": {
    "name": "postcss",
    "raw": "postcss@^4.1.16",
    "rawSpec": "^4.1.16",
    "scope": null,
    "spec": ">=4.1.16 <5.0.0",
    "type": "range"
  },
  "_requiredBy": [
    "/autoprefixer-core",
    "/myth"
  ],
  "_resolved": "https://registry.npmjs.org/postcss/-/postcss-4.1.16.tgz",
  "_shasum": "4c449b4c8af9df3caf6d37f8e1e575d0361758dc",
  "_shrinkwrap": null,
  "_spec": "postcss@^4.1.16",
  "_where": "X:\\Programmation\\NodeJS\\web-myth\\node_modules\\myth",
  "author": {
    "email": "andrey@sitnik.ru",
    "name": "Andrey Sitnik"
  },
  "bugs": {
    "url": "https://github.com/postcss/postcss/issues"
  },
  "dependencies": {
    "es6-promise": "~2.3.0",
    "js-base64": "~2.1.8",
    "source-map": "~0.4.2"
  },
  "description": "Tool for transforming CSS with JS plugins",
  "devDependencies": {
    "babel": "5.6.14",
    "chai": "3.0.0",
    "concat-with-sourcemaps": "1.0.2",
    "fs-extra": "0.21.0",
    "gulp": "3.9.0",
    "gulp-babel": "5.1.0",
    "gulp-eslint": "0.15.0",
    "gulp-json-editor": "2.2.1",
    "gulp-mocha": "2.1.2",
    "gulp-run": "1.6.8",
    "gulp-util": "3.0.6",
    "load-resources": "0.1.0",
    "mocha": "2.2.5",
    "sinon": "1.15.4",
    "yaspeller": "2.5.0"
  },
  "directories": {},
  "dist": {
    "shasum": "4c449b4c8af9df3caf6d37f8e1e575d0361758dc",
    "tarball": "https://registry.npmjs.org/postcss/-/postcss-4.1.16.tgz"
  },
  "homepage": "https://github.com/postcss/postcss#readme",
  "keywords": [
    "css",
    "postproccessor",
    "parser",
    "source map",
    "transform",
    "manipulation",
    "preprocess",
    "transpiler"
  ],
  "license": "MIT",
  "main": "lib/postcss",
  "maintainers": [
    {
      "email": "andrey@sitnik.ru",
      "name": "ai"
    }
  ],
  "name": "postcss",
  "optionalDependencies": {},
  "readme": "ERROR: No README data found!",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/postcss/postcss.git"
  },
  "scripts": {
    "test": "gulp"
  },
  "version": "4.1.16"
}

},{}],163:[function(require,module,exports){
// Copyright 2014 Simon Lydell
// X11 (“MIT”) Licensed. (See LICENSE.)

void (function(root, factory) {
  if (typeof define === "function" && define.amd) {
    define(factory)
  } else if (typeof exports === "object") {
    module.exports = factory()
  } else {
    root.resolveUrl = factory()
  }
}(this, function() {

  function resolveUrl(/* ...urls */) {
    var numUrls = arguments.length

    if (numUrls === 0) {
      throw new Error("resolveUrl requires at least one argument; got none.")
    }

    var base = document.createElement("base")
    base.href = arguments[0]

    if (numUrls === 1) {
      return base.href
    }

    var head = document.getElementsByTagName("head")[0]
    head.insertBefore(base, head.firstChild)

    var a = document.createElement("a")
    var resolved

    for (var index = 1; index < numUrls; index++) {
      a.href = arguments[index]
      resolved = a.href
      base.href = resolved
    }

    head.removeChild(base)

    return resolved
  }

  return resolveUrl

}));

},{}],164:[function(require,module,exports){
/**
 * Module dependencies.
 */

var balanced = require('balanced-match');
var visit = require('rework-visit');

/**
 * Constants.
 */

var CALC_FUNC_IDENTIFIER =  'calc';
var EXPRESSION_OPT_VENDOR_PREFIX = '(\\-[a-z]+\\-)?';
var EXPRESSION_METHOD_REGEXP = EXPRESSION_OPT_VENDOR_PREFIX + CALC_FUNC_IDENTIFIER;
var EXPRESSION_REGEXP = '\\b' + EXPRESSION_METHOD_REGEXP + '\\(';

/**
 * Module export.
 */

module.exports = function calc(style) {
  // resolve calculations
  visit(style, function (declarations, node) {
    var decl;
    var resolvedValue;
    var value;

    for (var i = 0; i < declarations.length; i++) {
      decl = declarations[i];
      value = decl.value;

      // skip comments
      if (decl.type !== 'declaration') continue;
      // skip values that don't contain calc() functions
      if (!value || value.indexOf(CALC_FUNC_IDENTIFIER + '(') === -1) continue;

      decl.value = resolveValue(value);
    }
  });
};

/**
 * Parses expressions in a value
 *
 * @param {String} value
 * @returns {Array}
 * @api private
 */

function getExpressions(value) {
  var expressions = [];
  var fnRE = new RegExp(EXPRESSION_METHOD_REGEXP);
  do {
    var searchMatch = fnRE.exec(value);
    var fn = searchMatch[0];
    var calcStartIndex = searchMatch.index;
    var calcRef = balanced('(', ')', value.substring(calcStartIndex));

    if (!calcRef) throw new Error('rework-calc: missing closing ")" in the value "' + value + '"');
    if (calcRef.body === '') throw new Error('rework-calc: calc() must contain a non-whitespace string');

    expressions.push({fn: fn, body: calcRef.body});
    value = calcRef.post;
  }
  while(fnRE.test(value));

  return expressions;
}

/**
 * Walkthrough all expressions, evaluate them and insert them into the declaration
 *
 * @param {Array} expressions
 * @param {Object} declaration
 * @api private
 */

function resolveValue(value) {
  getExpressions(value).forEach(function (expression) {
    var result = evaluateExpression(expression.body);

    value = value.replace(expression.fn + '(' + expression.body + ')', result.resolved ? result.value : expression.fn + '(' + result.value + ')');
  });

  return value;
}

/**
 * Evaluates an expression
 *
 * @param {String} expression
 * @returns {String}
 * @api private
 */

function evaluateExpression (expression) {
  // Remove method names for possible nested expressions:
  expression = expression.replace(new RegExp(EXPRESSION_REGEXP, 'g'), '(');

  var balancedExpr = balanced('(', ')', expression);
  if (balancedExpr && balancedExpr.body !== '') {
    expression = balancedExpr.pre + evaluateExpression(balancedExpr.body).value + balancedExpr.post;
  }

  var units = getUnitsInExpression(expression);

  // If multiple units let the expression be (i.e. browser calc())
  if (units.length > 1) return {resolved: false, value: expression};

  var unit = units[0] || "";

  if (unit === '%') {
    // Convert percentages to numbers, to handle expressions like: 50% * 50% (will become: 25%):
    expression = expression.replace(/\b[0-9\.]+%/g, function (percent) {
      return parseFloat(percent.slice(0, -1)) * 0.01;
    });
  }

  // Remove units in expression:
  var toEvaluate = expression.replace(new RegExp(unit, 'g'), '');
  var result;

  try {
    result = eval(toEvaluate);
  } catch (e) {
    return {resolved: false, value: expression};
  }

  // Transform back to a percentage result:
  if (unit === '%') result *= 100;

  // We don't need units for zero values...
  if (result !== 0) result += unit;

  return {resolved: true, value: result};
}

/**
 * Checks what units are used in an expression
 *
 * @param {String} expression
 * @returns {Array}
 * @api private
 */

function getUnitsInExpression(expression) {
  var uniqueUnits = [];
  var unitRegEx = /[\.0-9]([%a-z]+)/g;
  var matches;

  while (matches = unitRegEx.exec(expression)) {
    if (!matches || !matches[1]) continue;
    if (!~uniqueUnits.indexOf(matches[1])) uniqueUnits.push(matches[1]);
  }

  return uniqueUnits;
}

},{"balanced-match":57,"rework-visit":175}],165:[function(require,module,exports){

var balanced = require('balanced-match');
var color = require('css-color-function');

/**
 * Expose `plugin`.
 */

module.exports = plugin;

/**
 * Plugin to convert CSS color functions.
 *
 * @param {Object} stylesheet
 */

function plugin(stylesheet){
  stylesheet.rules.forEach(rule);
}

/**
 * Convert a `rule`.
 *
 * @param {Object} rule
 */

function rule(obj){
  if (obj.declarations) obj.declarations.forEach(declaration);
  if (obj.rules) obj.rules.forEach(rule);
  if (obj.keyframes) obj.keyframes.forEach(rule);
}

/**
 * Convert a `dec`.
 *
 * @param {Object} dec
 */

function declaration(dec){
  if (!dec.value) return;
  try {
    dec.value = convert(dec.value);
  } catch (err) {
    err.position = dec.position;
    throw err;
  }
}

/**
 * Convert any color functions in a CSS property value `string` into their RGBA
 * equivalent.
 *
 * @param {String} string
 * @return {String}
 */

function convert(string){
  var index = string.indexOf('color(');
  if (index == -1) return string;

  var fn = string.slice(index);
  var ret = balanced('(', ')', fn);
  if (!ret) throw new SyntaxError('Missing closing parentheses');
  fn = 'color(' + ret.body + ')';

  return string.slice(0, index) + color.convert(fn) + convert(ret.post);
}
},{"balanced-match":166,"css-color-function":112}],166:[function(require,module,exports){
module.exports = function(a, b, str) {
  var bal = 0;
  var m = {};

  for (var i = 0; i < str.length; i++) {
    if (str[i] == a) {
      if (!('start' in m)) m.start = i;
      bal++;
    }
    else if (str[i] == b) {
      bal--;
      if (!bal) {
        m.end = i;
        m.pre = str.substr(0, m.start);
        m.body = (m.end - m.start > 1)
          ? str.substring(m.start + 1, m.end)
          : '';
        m.post = str.slice(m.end + 1);
        return m;
      }
    }
  }
};


},{}],167:[function(require,module,exports){
/**
 * Constants.
 */

var EXTENSION_RE = /\((--[\w-]+)\)/;

/**
 * Module export.
 */

module.exports = function customMedia(ast) {
  var map = {};
  var indices = [];

  // define custom media query aliases
  ast.rules.forEach(function (rule, i) {
    if (rule.type !== 'custom-media') return;
    map[rule.name] = rule.media;
    indices.push(i);
  });

  // substitute custom media query aliases
  ast.rules.forEach(function (rule, i) {
    if (rule.type !== 'media') return;
    rule.media = rule.media.replace(EXTENSION_RE, function(_, name) {
      var replacement = map[name];
      var column = rule.position.start.column;
      var line = rule.position.start.line;
      var source = rule.position.source;

      if (replacement) {
        return replacement;
      } else {
        console.warn(
          'WARNING: undefined CSS custom media alias "' + name + '" at ' +
          line + ':' + column + (source ? ' in ' + source : '') + '.\n' +
          'The rule has been removed from the output. Please check your ' +
          '@custom-media definitions.'
        );
        indices.push(i);
      }
    });
  });

  // remove @custom-media blocks from css in reverse order to avoid affecting
  // indices before they are removed
  for (var i = indices.length - 1; i >= 0; i -= 1) {
    ast.rules.splice(indices[i], 1);
  }
};

},{}],168:[function(require,module,exports){

var properties = require('./properties');


/**
 * Expose `plugin`.
 */

module.exports = plugin;


/**
 * Convert `font-variant-*` properties into their open-type equivalents.
 *
 * @param {Object} stylesheet
 */

function plugin (stylesheet) {
  stylesheet.rules.forEach(function (rule) {
    if (!rule.declarations) return;
    var decs = [];
    rule.declarations.forEach(function (dec, i) {
      var value = variant(dec.property, dec.value);
      if (value) decs.push(value);
      decs.push(dec);
    });
    rule.declarations = decs;
  });
}


/**
 * Convert a `font-variant-*` property.
 *
 * @param {String} property
 * @param {String} value
 */

function variant (property, value) {
  if (!properties[property]) return null;

  var features = 'font-variant' == property
    ? shorthand(value)
    : properties[property][value]
      ? properties[property][value]
      : value;

  return {
    type: 'declaration',
    property: 'font-feature-settings',
    value: features
  };
}


/**
 * Convert the `font-variant` shorthand property.
 *
 * @param {String} value
 */

function shorthand (value) {
  var values = value.split(/\s+/g);
  return values.map(function (val) {
    return properties['font-variant'][val];
  }).join(', ');
}
},{"./properties":169}],169:[function(require,module,exports){

/**
 * The `font-variant-ligatures` property.
 */

exports['font-variant-ligatures'] = {
  'common-ligatures'           : '"liga", "clig"',
  'no-common-ligatures'        : '"liga", "clig off"',
  'discretionary-ligatures'    : '"dlig"',
  'no-discretionary-ligatures' : '"dlig" off',
  'historical-ligatures'       : '"hlig"',
  'no-historical-ligatures'    : '"hlig" off',
  'contextual'                 : '"calt"',
  'no-contextual'              : '"calt" off'
};

/**
 * The `font-variant-position` property.
 */

exports['font-variant-position'] = {
  'sub'   : '"subs"',
  'super' : '"sups"'
};

/**
 * The `font-variant-caps` property.
 */

exports['font-variant-caps'] = {
  'small-caps'      : '"c2sc"',
  'all-small-caps'  : '"smcp", "c2sc"',
  'petite-caps'     : '"pcap"',
  'all-petite-caps' : '"pcap", "c2pc"',
  'unicase'         : '"unic"',
  'titling-caps'    : '"titl"'
};

/**
 * The `font-variant-numeric` property.
 */

exports['font-variant-numeric'] = {
  'lining-nums'        : '"lnum"',
  'oldstyle-nums'      : '"onum"',
  'proportional-nums'  : '"pnum"',
  'tabular-nums'       : '"tnum"',
  'diagonal-fractions' : '"frac"',
  'stacked-fractions'  : '"afrc"',
  'ordinal'            : '"ordn"',
  'slashed-zero'       : '"zero"'
};


/**
 * The `font-variant` property is a shorthand for all the others.
 */

exports['font-variant'] = {
  'normal'  : 'normal',
  'inherit' : 'inherit'
};

for (var prop in exports) {
  var keys = exports[prop];
  for (var key in keys) {
    exports['font-variant'][key] = keys[key];
  }
}

},{}],170:[function(require,module,exports){

var convert = require('rgb');

/**
 * Expose `plugin`.
 */

module.exports = plugin;

/**
 * Hex alpha pattern matcher.
 */

var pattern = /(#[0-9a-f]{4}(?:[0-9a-f]{4})?)\b/i;

/**
 * Plugin to convert hex colors with alpha values into their RGBA equivalents
 * for more browser support.
 *
 * @param {Object} stylesheet
 */

function plugin(stylesheet){
  stylesheet.rules.forEach(rule);
}

/**
 * Convert a rule.
 *
 * @param {Object} obj
 * @param {Number} i
 */

function rule(obj, i){
  if (obj.declarations) obj.declarations.forEach(declaration);
  if (obj.rules) obj.rules.forEach(rule);
}

/**
 * Convert a declaration.
 *
 * @param {Object} obj
 * @param {Number} i
 */

function declaration(obj, i){
  var val = obj.value;
  if (!val) return;
  var m = pattern.exec(val);
  if (!m) return;

  var hex = m[1];
  var rgb = convert(hex);
  var i = val.indexOf(hex);
  var l = hex.length;
  obj.value = val.slice(0, i) + rgb + val.slice(i + l);
}
},{"rgb":171}],171:[function(require,module,exports){
/*
color
*/"use strict"

var colors = {
    maroon      : "#800000",
    red         : "#ff0000",
    orange      : "#ffA500",
    yellow      : "#ffff00",
    olive       : "#808000",
    purple      : "#800080",
    fuchsia     : "#ff00ff",
    white       : "#ffffff",
    lime        : "#00ff00",
    green       : "#008000",
    navy        : "#000080",
    blue        : "#0000ff",
    aqua        : "#00ffff",
    teal        : "#008080",
    black       : "#000000",
    silver      : "#c0c0c0",
    gray        : "#808080",
    transparent : "#0000"
}

var RGBtoRGB = function(r, g, b, a){
    if (a == null || a === "") a = 1
    r = parseFloat(r)
    g = parseFloat(g)
    b = parseFloat(b)
    a = parseFloat(a)
    if (!(r <= 255 && r >= 0 && g <= 255 && g >= 0 && b <= 255 && b >= 0 && a <= 1 && a >= 0)) return null

    return [Math.round(r), Math.round(g), Math.round(b), a]
}

var HEXtoRGB = function(hex){
    if (hex.length === 3) hex += "f"
    if (hex.length === 4){
        var h0 = hex.charAt(0),
            h1 = hex.charAt(1),
            h2 = hex.charAt(2),
            h3 = hex.charAt(3)

        hex = h0 + h0 + h1 + h1 + h2 + h2 + h3 + h3
    }
    if (hex.length === 6) hex += "ff"
    var rgb = []
    for (var i = 0, l = hex.length; i < l; i += 2) rgb.push(parseInt(hex.substr(i, 2), 16) / (i === 6 ? 255 : 1))
    return rgb
}

// HSL to RGB conversion from:
// http://mjijackson.com/2008/02/rgb-to-hsl-and-rgb-to-hsv-color-model-conversion-algorithms-in-javascript
// thank you!

var HUEtoRGB = function(p, q, t){
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
}

var HSLtoRGB = function(h, s, l, a){
    var r, b, g
    if (a == null || a === "") a = 1
    h = parseFloat(h) / 360
    s = parseFloat(s) / 100
    l = parseFloat(l) / 100
    a = parseFloat(a) / 1
    if (h > 1 || h < 0 || s > 1 || s < 0 || l > 1 || l < 0 || a > 1 || a < 0) return null
    if (s === 0){
        r = b = g = l
    } else {
        var q = l < 0.5 ? l * (1 + s) : l + s - l * s
        var p = 2 * l - q
        r = HUEtoRGB(p, q, h + 1 / 3)
        g = HUEtoRGB(p, q, h)
        b = HUEtoRGB(p, q, h - 1 / 3)
    }
    return [r * 255, g * 255, b * 255, a]
}

var keys = []
for (var c in colors) keys.push(c)

var shex  = "(?:#([a-f0-9]{3,8}))",
    sval  = "\\s*([.\\d%]+)\\s*",
    sop   = "(?:,\\s*([.\\d]+)\\s*)?",
    slist = "\\(" + [sval, sval, sval] + sop + "\\)",
    srgb  = "(?:rgb)a?",
    shsl  = "(?:hsl)a?",
    skeys = "(" + keys.join("|") + ")"


var xhex   = RegExp(shex, "i"),
    xrgb   = RegExp(srgb + slist, "i"),
    xhsl   = RegExp(shsl + slist, "i")

var color = function(input, array){
    if (input == null) return null
    input = (input + "").replace(/\s+/, "")

    var match = colors[input]
    if (match){
        return color(match, array)
    } else if (match = input.match(xhex)){
        input = HEXtoRGB(match[1])
    } else if (match = input.match(xrgb)){
        input = match.slice(1)
    } else if (match = input.match(xhsl)){
        input = HSLtoRGB.apply(null, match.slice(1))
    } else return null

    if (!(input && (input = RGBtoRGB.apply(null, input)))) return null
    if (array) return input
    if (input[3] === 1) input.splice(3, 1)
    return "rgb" + (input.length === 4 ? "a" : "") + "(" + input + ")"
}

var regexp = RegExp([skeys, shex, srgb + slist, shsl + slist].join("|"), "gi")

color.replace = function(string, method){
    if (!method) method = function(match){
        return color(match)
    }
    return (string + "").replace(regexp, method)
}

color.matches = function(string){
    return !!(string + "").match(regexp)
}

module.exports = color

},{}],172:[function(require,module,exports){
(function (process){
'use strict';

var css = require('css');
var findFile = require('find-file');
var fs = require('fs');
var parseImport = require('parse-import');
var path = require('path');

/**
 * Inline stylesheet using `@import`
 *
 * @param {Object} style
 * @param {Object} opts
 * @api public
 */

function Import(style, opts) {
    var sourceDir
    if (style.rules.length && style.rules[0].position && style.rules[0].position.source) {
        sourceDir = path.dirname(style.rules[0].position.source)
    }

    this.opts = opts || {};

    this.opts.path = (
        // convert string to an array or single element
        typeof this.opts.path === 'string' ?
        [this.opts.path] :
        (this.opts.path || []) // fallback to empty array
    );
    // if source available, prepend sourceDir in the path array
    if (sourceDir && this.opts.path.indexOf(sourceDir) === -1) {
        this.opts.path.unshift(sourceDir);
    }
    // if we got nothing for the path, just use cwd
    if (this.opts.path.length === 0) {
        this.opts.path.push(process.cwd());
    }
    this.opts.transform = this.opts.transform || function(value) { return value };
    this.rules = style.rules || [];
}

/**
 * Process stylesheet
 *
 * @api public
 */

Import.prototype.process = function () {
    var rules = [];
    var self = this;

    this.rules.forEach(function (rule) {
        if (rule.type !== 'import') {
            return rules.push(rule);
        }

        var data = parseImport(rule.import);

        // ignore protocol base uri (protocol://url) or protocol-relative (//url)
        if (data.path.match(/^(?:[a-z]+:)?\/\//i)) {
            return rules.push(rule);
        }

        var opts = cloneOpts(self.opts);
        opts.source = self._check(data.path, rule.position ? rule.position.source : undefined);
        var dirname = path.dirname(opts.source);

        if (opts.path.indexOf(dirname) === -1 ) {
            opts.path = opts.path.slice();
            opts.path.unshift(dirname);
        }

        var media = data.condition;
        var res;
        var content = self._read(opts.source);

        parseStyle(content, opts);

        if (!media || !media.length) {
            res = content.rules;
        } else {
            res = {
                type: 'media',
                media: media,
                rules: content.rules
            };
        }

        rules = rules.concat(res);
    });

    return rules;
};

/**
 * Read the contents of a file
 *
 * @param {String} file
 * @api private
 */

Import.prototype._read = function (file) {
    var data = this.opts.transform(fs.readFileSync(file, this.opts.encoding || 'utf8'), file);
    var style = css.parse(data, {source: file}).stylesheet;

    return style;
};

/**
 * Check if a file exists
 *
 * @param {String} name
 * @api private
 */

Import.prototype._check = function (name, source) {
    var file = findFile(name, { path: this.opts.path, global: false });
    if (!file) {
        throw new Error(
            'Failed to find ' + name +
            (source ? "\n    from " + source : "") +
            "\n    in [ " +
            "\n        " + this.opts.path.join(",\n        ") +
            "\n    ]"
        );
    }

    return file[0];
};

/**
 * Parse @import in given style
 *
 * @param {Object} style
 * @param {Object} opts
 */

function parseStyle(style, opts) {
    var inline = new Import(style, opts);
    var rules = inline.process();

    style.rules = rules;
}

/**
 * Clone object
 *
 * @param {Object} obj
 */

function cloneOpts(obj) {
    var opts = {};
    opts.path = obj.path.slice();
    opts.source = obj.source;
    opts.transform = obj.transform;
    return opts;
}

/**
 * Module exports
 */

module.exports = function (opts) {
    return function (style) {
        parseStyle(style, opts);
    };
};

}).call(this,require('_process'))
},{"_process":7,"css":114,"find-file":133,"fs":1,"parse-import":139,"path":6}],173:[function(require,module,exports){
(function () {
  var rework = require('rework');
  var match = /(rebeccapurple)\b/i;
  var colorvalue = '#663399';

  module.exports = function (stylesheet) {
    stylesheet.rules.map(rule);
  };

  function rule(obj) {
    if (obj.declarations) {
      obj.declarations.map(declaration);
    }
    if (obj.rules) {
      obj.rules.map(rule);
    }
    return obj;
  }

  function declaration(obj) {
    if (obj.type === 'declaration' && match.test(obj.value)) {
      obj.value = obj.value.replace(match, colorvalue);
    }
    return obj;
  }

}());

},{"rework":176}],174:[function(require,module,exports){
/**
 * Module dependencies.
 */

var balanced = require('balanced-match');
var visit = require('rework-visit');

/**
 * Constants.
 */

var VAR_PROP_IDENTIFIER = '--';
var VAR_FUNC_IDENTIFIER = 'var';

/**
 * Module export.
 */

module.exports = function (options) {

  return function vars(style) {
    options = options || {};
    var map = options.map || {};
    var preserve = (options.preserve === true ? true : false);

    // define variables
    style.rules.forEach(function (rule) {
      var varNameIndices = [];

      if (rule.type !== 'rule') return;
      // only variables declared for `:root` are supported
      if (rule.selectors.length !== 1 || rule.selectors[0] !== ':root') return;

      rule.declarations.forEach(function (decl, i) {
        var prop = decl.property;
        var value = decl.value;

        if (prop && prop.indexOf(VAR_PROP_IDENTIFIER) === 0) {
          map[prop] = value;
          varNameIndices.push(i);
        }
      });

      // optionally remove `--*` properties from the rule
      if (!preserve) {
        for (var i = varNameIndices.length - 1; i >= 0; i--) {
          rule.declarations.splice(varNameIndices[i], 1);
        }
      }
    });

    // resolve variables
    visit(style, function (declarations, node) {
      var decl;
      var resolvedValue;
      var value;

      for (var i = 0; i < declarations.length; i++) {
        decl = declarations[i];
        value = decl.value;

        // skip comments
        if (decl.type !== 'declaration') continue;
        // skip values that don't contain variable functions
        if (!value || value.indexOf(VAR_FUNC_IDENTIFIER + '(') === -1) continue;

        resolvedValue = resolveValue(value, map);

        if (!preserve) {
          decl.value = resolvedValue;
        }
        else {
          declarations.splice(i, 0, {
            type: decl.type,
            property: decl.property,
            value: resolvedValue
          });
          // skip ahead of preserved declaration
          i++;
        }
      }
    });
  };
};

/**
 * Resolve CSS variables in a value
 *
 * The second argument to a CSS variable function, if provided, is a fallback
 * value, which is used as the substitution value when the referenced variable
 * is invalid.
 *
 * var(name[, fallback])
 *
 * @param {String} value A property value known to contain CSS variable functions
 * @param {Object} map A map of variable names and values
 * @return {String} A property value with all CSS variables substituted.
 */

function resolveValue(value, map) {
  // matches `name[, fallback]`, captures 'name' and 'fallback'
  var RE_VAR = /([\w-]+)(?:\s*,\s*)?(.*)?/;
  var balancedParens = balanced('(', ')', value);
  var varStartIndex = value.indexOf('var(');
  var varRef = balanced('(', ')', value.substring(varStartIndex)).body;

  if (!balancedParens) throw new Error('rework-vars: missing closing ")" in the value "' + value + '"');
  if (varRef === '') throw new Error('rework-vars: var() must contain a non-whitespace string');

  var varFunc = VAR_FUNC_IDENTIFIER + '(' + varRef + ')';

  var varResult = varRef.replace(RE_VAR, function (_, name, fallback) {
    var replacement = map[name];
    if (!replacement && !fallback) throw new Error('rework-vars: variable "' + name + '" is undefined');
    if (!replacement && fallback) return fallback;
    return replacement;
  });


  // resolve the variable
  value = value.split(varFunc).join(varResult);

  // recursively resolve any remaining variables in the value
  if (value.indexOf(VAR_FUNC_IDENTIFIER) !== -1) {
    value = resolveValue(value, map);
  }

  return value;
}

},{"balanced-match":57,"rework-visit":175}],175:[function(require,module,exports){

/**
 * Expose `visit()`.
 */

module.exports = visit;

/**
 * Visit `node`'s declarations recursively and
 * invoke `fn(declarations, node)`.
 *
 * @param {Object} node
 * @param {Function} fn
 * @api private
 */

function visit(node, fn){
  node.rules.forEach(function(rule){
    // @media etc
    if (rule.rules) {
      visit(rule, fn);
      return;
    }

    // keyframes
    if (rule.keyframes) {
      rule.keyframes.forEach(function(keyframe){
        fn(keyframe.declarations, rule);
      });
      return;
    }

    // @charset, @import etc
    if (!rule.declarations) return;

    fn(rule.declarations, node);
  });
};

},{}],176:[function(require,module,exports){

/**
 * Module dependencies.
 */

var css = require('css');
var convertSourceMap = require('convert-source-map');
var parse = css.parse;
var stringify = css.stringify;

/**
 * Expose `rework`.
 */

exports = module.exports = rework;

/**
 * Initialize a new stylesheet `Rework` with `str`.
 *
 * @param {String} str
 * @param {Object} options
 * @return {Rework}
 * @api public
 */

function rework(str, options) {
  return new Rework(parse(str, options));
}

/**
 * Initialize a new stylesheet `Rework` with `obj`.
 *
 * @param {Object} obj
 * @api private
 */

function Rework(obj) {
  this.obj = obj;
}

/**
 * Use the given plugin `fn(style, rework)`.
 *
 * @param {Function} fn
 * @return {Rework}
 * @api public
 */

Rework.prototype.use = function(fn){
  fn(this.obj.stylesheet, this);
  return this;
};

/**
 * Stringify the stylesheet.
 *
 * @param {Object} options
 * @return {String}
 * @api public
 */

Rework.prototype.toString = function(options){
  options = options || {};
  var result = stringify(this.obj, options);
  if (options.sourcemap && !options.sourcemapAsObject) {
    result = result.code + '\n' + sourcemapToComment(result.map);
  }
  return result;
};

/**
 * Convert sourcemap to base64-encoded comment
 *
 * @param {Object} map
 * @return {String}
 * @api private
 */

function sourcemapToComment(map) {
  var content = convertSourceMap.fromObject(map).toBase64();
  return '/*# sourceMappingURL=data:application/json;base64,' + content + ' */';
}

},{"convert-source-map":109,"css":114}],177:[function(require,module,exports){
// Copyright 2014 Simon Lydell
// X11 (“MIT”) Licensed. (See LICENSE.)

// Note: source-map-resolve.js is generated from source-map-resolve-node.js and
// source-map-resolve-template.js. Only edit the two latter files, _not_
// source-map-resolve.js!

void (function(root, factory) {
  if (typeof define === "function" && define.amd) {
    define(["source-map-url", "resolve-url"], factory)
  } else if (typeof exports === "object") {
    var sourceMappingURL = require("source-map-url")
    var resolveUrl = require("resolve-url")
    module.exports = factory(sourceMappingURL, resolveUrl)
  } else {
    root.sourceMapResolve = factory(root.sourceMappingURL, root.resolveUrl)
  }
}(this, function(sourceMappingURL, resolveUrl) {

  function callbackAsync(callback, error, result) {
    setImmediate(function() { callback(error, result) })
  }

  function parseMapToJSON(string) {
    return JSON.parse(string.replace(/^\)\]\}'/, ""))
  }



  function resolveSourceMap(code, codeUrl, read, callback) {
    var mapData
    try {
      mapData = resolveSourceMapHelper(code, codeUrl)
    } catch (error) {
      return callbackAsync(callback, error)
    }
    if (!mapData || mapData.map) {
      return callbackAsync(callback, null, mapData)
    }
    read(mapData.url, function(error, result) {
      if (error) {
        return callback(error)
      }
      try {
        mapData.map = parseMapToJSON(String(result))
      } catch (error) {
        return callback(error)
      }
      callback(null, mapData)
    })
  }

  function resolveSourceMapSync(code, codeUrl, read) {
    var mapData = resolveSourceMapHelper(code, codeUrl)
    if (!mapData || mapData.map) {
      return mapData
    }
    mapData.map = parseMapToJSON(String(read(mapData.url)))
    return mapData
  }

  var dataUriRegex = /^data:([^,;]*)(;[^,;]*)*(?:,(.*))?$/
  var jsonMimeTypeRegex = /^(?:application|text)\/json$/

  function resolveSourceMapHelper(code, codeUrl) {
    var url = sourceMappingURL.getFrom(code)
    if (!url) {
      return null
    }

    var dataUri = url.match(dataUriRegex)
    if (dataUri) {
      var mimeType = dataUri[1]
      var lastParameter = dataUri[2]
      var encoded = dataUri[3]
      if (!jsonMimeTypeRegex.test(mimeType)) {
        throw new Error("Unuseful data uri mime type: " + (mimeType || "text/plain"))
      }
      return {
        sourceMappingURL: url,
        url: null,
        sourcesRelativeTo: codeUrl,
        map: parseMapToJSON(lastParameter === ";base64" ? atob(encoded) : decodeURIComponent(encoded))
      }
    }

    var mapUrl = resolveUrl(codeUrl, url)
    return {
      sourceMappingURL: url,
      url: mapUrl,
      sourcesRelativeTo: mapUrl,
      map: null
    }
  }



  function resolveSources(map, mapUrl, read, options, callback) {
    if (typeof options === "function") {
      callback = options
      options = {}
    }
    var pending = map.sources.length
    var errored = false
    var result = {
      sourcesResolved: [],
      sourcesContent:  []
    }

    var done = function(error) {
      if (errored) {
        return
      }
      if (error) {
        errored = true
        return callback(error)
      }
      pending--
      if (pending === 0) {
        callback(null, result)
      }
    }

    resolveSourcesHelper(map, mapUrl, options, function(fullUrl, sourceContent, index) {
      result.sourcesResolved[index] = fullUrl
      if (typeof sourceContent === "string") {
        result.sourcesContent[index] = sourceContent
        callbackAsync(done, null)
      } else {
        read(fullUrl, function(error, source) {
          result.sourcesContent[index] = String(source)
          done(error)
        })
      }
    })
  }

  function resolveSourcesSync(map, mapUrl, read, options) {
    var result = {
      sourcesResolved: [],
      sourcesContent:  []
    }
    resolveSourcesHelper(map, mapUrl, options, function(fullUrl, sourceContent, index) {
      result.sourcesResolved[index] = fullUrl
      if (read !== null) {
        if (typeof sourceContent === "string") {
          result.sourcesContent[index] = sourceContent
        } else {
          result.sourcesContent[index] = String(read(fullUrl))
        }
      }
    })
    return result
  }

  var endingSlash = /\/?$/

  function resolveSourcesHelper(map, mapUrl, options, fn) {
    options = options || {}
    var fullUrl
    var sourceContent
    for (var index = 0, len = map.sources.length; index < len; index++) {
      if (map.sourceRoot && !options.ignoreSourceRoot) {
        // Make sure that the sourceRoot ends with a slash, so that `/scripts/subdir` becomes
        // `/scripts/subdir/<source>`, not `/scripts/<source>`. Pointing to a file as source root
        // does not make sense.
        fullUrl = resolveUrl(mapUrl, map.sourceRoot.replace(endingSlash, "/"), map.sources[index])
      } else {
        fullUrl = resolveUrl(mapUrl, map.sources[index])
      }
      sourceContent = (map.sourcesContent || [])[index]
      fn(fullUrl, sourceContent, index)
    }
  }



  function resolve(code, codeUrl, read, options, callback) {
    if (typeof options === "function") {
      callback = options
      options = {}
    }
    resolveSourceMap(code, codeUrl, read, function(error, mapData) {
      if (error) {
        return callback(error)
      }
      if (!mapData) {
        return callback(null, null)
      }
      resolveSources(mapData.map, mapData.sourcesRelativeTo, read, options, function(error, result) {
        if (error) {
          return callback(error)
        }
        mapData.sourcesResolved = result.sourcesResolved
        mapData.sourcesContent  = result.sourcesContent
        callback(null, mapData)
      })
    })
  }

  function resolveSync(code, codeUrl, read, options) {
    var mapData = resolveSourceMapSync(code, codeUrl, read)
    if (!mapData) {
      return null
    }
    var result = resolveSourcesSync(mapData.map, mapData.sourcesRelativeTo, read, options)
    mapData.sourcesResolved = result.sourcesResolved
    mapData.sourcesContent  = result.sourcesContent
    return mapData
  }



  return {
    resolveSourceMap:     resolveSourceMap,
    resolveSourceMapSync: resolveSourceMapSync,
    resolveSources:       resolveSources,
    resolveSourcesSync:   resolveSourcesSync,
    resolve:              resolve,
    resolveSync:          resolveSync
  }

}));

},{"resolve-url":163,"source-map-url":178}],178:[function(require,module,exports){
// Copyright 2014 Simon Lydell
// X11 (“MIT”) Licensed. (See LICENSE.)

void (function(root, factory) {
  if (typeof define === "function" && define.amd) {
    define(factory)
  } else if (typeof exports === "object") {
    module.exports = factory()
  } else {
    root.sourceMappingURL = factory()
  }
}(this, function() {

  var innerRegex = /[#@] sourceMappingURL=([^\s'"]*)/

  var regex = RegExp(
    "(?:" +
      "/\\*" +
      "(?:\\s*\r?\n(?://)?)?" +
      "(?:" + innerRegex.source + ")" +
      "\\s*" +
      "\\*/" +
      "|" +
      "//(?:" + innerRegex.source + ")" +
    ")" +
    "\\s*$"
  )

  return {

    regex: regex,
    _innerRegex: innerRegex,

    getFrom: function(code) {
      var match = code.match(regex)
      return (match ? match[1] || match[2] || "" : null)
    },

    existsIn: function(code) {
      return regex.test(code)
    },

    removeFrom: function(code) {
      return code.replace(regex, "")
    },

    insertBefore: function(code, string) {
      var match = code.match(regex)
      if (match) {
        return code.slice(0, match.index) + string + code.slice(match.index)
      } else {
        return code + string
      }
    }
  }

}));

},{}],179:[function(require,module,exports){
arguments[4][121][0].apply(exports,arguments)
},{"./source-map/source-map-consumer":186,"./source-map/source-map-generator":187,"./source-map/source-node":188,"dup":121}],180:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var util = require('./util');

  /**
   * A data structure which is a combination of an array and a set. Adding a new
   * member is O(1), testing for membership is O(1), and finding the index of an
   * element is O(1). Removing elements from the set is not supported. Only
   * strings are supported for membership.
   */
  function ArraySet() {
    this._array = [];
    this._set = {};
  }

  /**
   * Static method for creating ArraySet instances from an existing array.
   */
  ArraySet.fromArray = function ArraySet_fromArray(aArray, aAllowDuplicates) {
    var set = new ArraySet();
    for (var i = 0, len = aArray.length; i < len; i++) {
      set.add(aArray[i], aAllowDuplicates);
    }
    return set;
  };

  /**
   * Return how many unique items are in this ArraySet. If duplicates have been
   * added, than those do not count towards the size.
   *
   * @returns Number
   */
  ArraySet.prototype.size = function ArraySet_size() {
    return Object.getOwnPropertyNames(this._set).length;
  };

  /**
   * Add the given string to this set.
   *
   * @param String aStr
   */
  ArraySet.prototype.add = function ArraySet_add(aStr, aAllowDuplicates) {
    var isDuplicate = this.has(aStr);
    var idx = this._array.length;
    if (!isDuplicate || aAllowDuplicates) {
      this._array.push(aStr);
    }
    if (!isDuplicate) {
      this._set[util.toSetString(aStr)] = idx;
    }
  };

  /**
   * Is the given string a member of this set?
   *
   * @param String aStr
   */
  ArraySet.prototype.has = function ArraySet_has(aStr) {
    return Object.prototype.hasOwnProperty.call(this._set,
                                                util.toSetString(aStr));
  };

  /**
   * What is the index of the given string in the array?
   *
   * @param String aStr
   */
  ArraySet.prototype.indexOf = function ArraySet_indexOf(aStr) {
    if (this.has(aStr)) {
      return this._set[util.toSetString(aStr)];
    }
    throw new Error('"' + aStr + '" is not in the set.');
  };

  /**
   * What is the element at the given index?
   *
   * @param Number aIdx
   */
  ArraySet.prototype.at = function ArraySet_at(aIdx) {
    if (aIdx >= 0 && aIdx < this._array.length) {
      return this._array[aIdx];
    }
    throw new Error('No element indexed by ' + aIdx);
  };

  /**
   * Returns the array representation of this set (which has the proper indices
   * indicated by indexOf). Note that this is a copy of the internal array used
   * for storing the members so that no one can mess with internal state.
   */
  ArraySet.prototype.toArray = function ArraySet_toArray() {
    return this._array.slice();
  };

  exports.ArraySet = ArraySet;

});

},{"./util":189,"amdefine":8}],181:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 *
 * Based on the Base 64 VLQ implementation in Closure Compiler:
 * https://code.google.com/p/closure-compiler/source/browse/trunk/src/com/google/debugging/sourcemap/Base64VLQ.java
 *
 * Copyright 2011 The Closure Compiler Authors. All rights reserved.
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *  * Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above
 *    copyright notice, this list of conditions and the following
 *    disclaimer in the documentation and/or other materials provided
 *    with the distribution.
 *  * Neither the name of Google Inc. nor the names of its
 *    contributors may be used to endorse or promote products derived
 *    from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var base64 = require('./base64');

  // A single base 64 digit can contain 6 bits of data. For the base 64 variable
  // length quantities we use in the source map spec, the first bit is the sign,
  // the next four bits are the actual value, and the 6th bit is the
  // continuation bit. The continuation bit tells us whether there are more
  // digits in this value following this digit.
  //
  //   Continuation
  //   |    Sign
  //   |    |
  //   V    V
  //   101011

  var VLQ_BASE_SHIFT = 5;

  // binary: 100000
  var VLQ_BASE = 1 << VLQ_BASE_SHIFT;

  // binary: 011111
  var VLQ_BASE_MASK = VLQ_BASE - 1;

  // binary: 100000
  var VLQ_CONTINUATION_BIT = VLQ_BASE;

  /**
   * Converts from a two-complement value to a value where the sign bit is
   * placed in the least significant bit.  For example, as decimals:
   *   1 becomes 2 (10 binary), -1 becomes 3 (11 binary)
   *   2 becomes 4 (100 binary), -2 becomes 5 (101 binary)
   */
  function toVLQSigned(aValue) {
    return aValue < 0
      ? ((-aValue) << 1) + 1
      : (aValue << 1) + 0;
  }

  /**
   * Converts to a two-complement value from a value where the sign bit is
   * placed in the least significant bit.  For example, as decimals:
   *   2 (10 binary) becomes 1, 3 (11 binary) becomes -1
   *   4 (100 binary) becomes 2, 5 (101 binary) becomes -2
   */
  function fromVLQSigned(aValue) {
    var isNegative = (aValue & 1) === 1;
    var shifted = aValue >> 1;
    return isNegative
      ? -shifted
      : shifted;
  }

  /**
   * Returns the base 64 VLQ encoded value.
   */
  exports.encode = function base64VLQ_encode(aValue) {
    var encoded = "";
    var digit;

    var vlq = toVLQSigned(aValue);

    do {
      digit = vlq & VLQ_BASE_MASK;
      vlq >>>= VLQ_BASE_SHIFT;
      if (vlq > 0) {
        // There are still more digits in this value, so we must make sure the
        // continuation bit is marked.
        digit |= VLQ_CONTINUATION_BIT;
      }
      encoded += base64.encode(digit);
    } while (vlq > 0);

    return encoded;
  };

  /**
   * Decodes the next base 64 VLQ value from the given string and returns the
   * value and the rest of the string via the out parameter.
   */
  exports.decode = function base64VLQ_decode(aStr, aIndex, aOutParam) {
    var strLen = aStr.length;
    var result = 0;
    var shift = 0;
    var continuation, digit;

    do {
      if (aIndex >= strLen) {
        throw new Error("Expected more digits in base 64 VLQ value.");
      }

      digit = base64.decode(aStr.charCodeAt(aIndex++));
      if (digit === -1) {
        throw new Error("Invalid base64 digit: " + aStr.charAt(aIndex - 1));
      }

      continuation = !!(digit & VLQ_CONTINUATION_BIT);
      digit &= VLQ_BASE_MASK;
      result = result + (digit << shift);
      shift += VLQ_BASE_SHIFT;
    } while (continuation);

    aOutParam.value = fromVLQSigned(result);
    aOutParam.rest = aIndex;
  };

});

},{"./base64":182,"amdefine":8}],182:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var intToCharMap = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('');

  /**
   * Encode an integer in the range of 0 to 63 to a single base 64 digit.
   */
  exports.encode = function (number) {
    if (0 <= number && number < intToCharMap.length) {
      return intToCharMap[number];
    }
    throw new TypeError("Must be between 0 and 63: " + aNumber);
  };

  /**
   * Decode a single base 64 character code digit to an integer. Returns -1 on
   * failure.
   */
  exports.decode = function (charCode) {
    var bigA = 65;     // 'A'
    var bigZ = 90;     // 'Z'

    var littleA = 97;  // 'a'
    var littleZ = 122; // 'z'

    var zero = 48;     // '0'
    var nine = 57;     // '9'

    var plus = 43;     // '+'
    var slash = 47;    // '/'

    var littleOffset = 26;
    var numberOffset = 52;

    // 0 - 25: ABCDEFGHIJKLMNOPQRSTUVWXYZ
    if (bigA <= charCode && charCode <= bigZ) {
      return (charCode - bigA);
    }

    // 26 - 51: abcdefghijklmnopqrstuvwxyz
    if (littleA <= charCode && charCode <= littleZ) {
      return (charCode - littleA + littleOffset);
    }

    // 52 - 61: 0123456789
    if (zero <= charCode && charCode <= nine) {
      return (charCode - zero + numberOffset);
    }

    // 62: +
    if (charCode == plus) {
      return 62;
    }

    // 63: /
    if (charCode == slash) {
      return 63;
    }

    // Invalid base64 digit.
    return -1;
  };

});

},{"amdefine":8}],183:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  exports.GREATEST_LOWER_BOUND = 1;
  exports.LEAST_UPPER_BOUND = 2;

  /**
   * Recursive implementation of binary search.
   *
   * @param aLow Indices here and lower do not contain the needle.
   * @param aHigh Indices here and higher do not contain the needle.
   * @param aNeedle The element being searched for.
   * @param aHaystack The non-empty array being searched.
   * @param aCompare Function which takes two elements and returns -1, 0, or 1.
   * @param aBias Either 'binarySearch.GREATEST_LOWER_BOUND' or
   *     'binarySearch.LEAST_UPPER_BOUND'. Specifies whether to return the
   *     closest element that is smaller than or greater than the one we are
   *     searching for, respectively, if the exact element cannot be found.
   */
  function recursiveSearch(aLow, aHigh, aNeedle, aHaystack, aCompare, aBias) {
    // This function terminates when one of the following is true:
    //
    //   1. We find the exact element we are looking for.
    //
    //   2. We did not find the exact element, but we can return the index of
    //      the next-closest element.
    //
    //   3. We did not find the exact element, and there is no next-closest
    //      element than the one we are searching for, so we return -1.
    var mid = Math.floor((aHigh - aLow) / 2) + aLow;
    var cmp = aCompare(aNeedle, aHaystack[mid], true);
    if (cmp === 0) {
      // Found the element we are looking for.
      return mid;
    }
    else if (cmp > 0) {
      // Our needle is greater than aHaystack[mid].
      if (aHigh - mid > 1) {
        // The element is in the upper half.
        return recursiveSearch(mid, aHigh, aNeedle, aHaystack, aCompare, aBias);
      }

      // The exact needle element was not found in this haystack. Determine if
      // we are in termination case (3) or (2) and return the appropriate thing.
      if (aBias == exports.LEAST_UPPER_BOUND) {
        return aHigh < aHaystack.length ? aHigh : -1;
      } else {
        return mid;
      }
    }
    else {
      // Our needle is less than aHaystack[mid].
      if (mid - aLow > 1) {
        // The element is in the lower half.
        return recursiveSearch(aLow, mid, aNeedle, aHaystack, aCompare, aBias);
      }

      // we are in termination case (3) or (2) and return the appropriate thing.
      if (aBias == exports.LEAST_UPPER_BOUND) {
        return mid;
      } else {
        return aLow < 0 ? -1 : aLow;
      }
    }
  }

  /**
   * This is an implementation of binary search which will always try and return
   * the index of the closest element if there is no exact hit. This is because
   * mappings between original and generated line/col pairs are single points,
   * and there is an implicit region between each of them, so a miss just means
   * that you aren't on the very start of a region.
   *
   * @param aNeedle The element you are looking for.
   * @param aHaystack The array that is being searched.
   * @param aCompare A function which takes the needle and an element in the
   *     array and returns -1, 0, or 1 depending on whether the needle is less
   *     than, equal to, or greater than the element, respectively.
   * @param aBias Either 'binarySearch.GREATEST_LOWER_BOUND' or
   *     'binarySearch.LEAST_UPPER_BOUND'. Specifies whether to return the
   *     closest element that is smaller than or greater than the one we are
   *     searching for, respectively, if the exact element cannot be found.
   *     Defaults to 'binarySearch.GREATEST_LOWER_BOUND'.
   */
  exports.search = function search(aNeedle, aHaystack, aCompare, aBias) {
    if (aHaystack.length === 0) {
      return -1;
    }

    var index = recursiveSearch(-1, aHaystack.length, aNeedle, aHaystack,
                                aCompare, aBias || exports.GREATEST_LOWER_BOUND);
    if (index < 0) {
      return -1;
    }

    // We have found either the exact element, or the next-closest element than
    // the one we are searching for. However, there may be more than one such
    // element. Make sure we always return the smallest of these.
    while (index - 1 >= 0) {
      if (aCompare(aHaystack[index], aHaystack[index - 1], true) !== 0) {
        break;
      }
      --index;
    }

    return index;
  };

});

},{"amdefine":8}],184:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2014 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var util = require('./util');

  /**
   * Determine whether mappingB is after mappingA with respect to generated
   * position.
   */
  function generatedPositionAfter(mappingA, mappingB) {
    // Optimized for most common case
    var lineA = mappingA.generatedLine;
    var lineB = mappingB.generatedLine;
    var columnA = mappingA.generatedColumn;
    var columnB = mappingB.generatedColumn;
    return lineB > lineA || lineB == lineA && columnB >= columnA ||
           util.compareByGeneratedPositionsInflated(mappingA, mappingB) <= 0;
  }

  /**
   * A data structure to provide a sorted view of accumulated mappings in a
   * performance conscious manner. It trades a neglibable overhead in general
   * case for a large speedup in case of mappings being added in order.
   */
  function MappingList() {
    this._array = [];
    this._sorted = true;
    // Serves as infimum
    this._last = {generatedLine: -1, generatedColumn: 0};
  }

  /**
   * Iterate through internal items. This method takes the same arguments that
   * `Array.prototype.forEach` takes.
   *
   * NOTE: The order of the mappings is NOT guaranteed.
   */
  MappingList.prototype.unsortedForEach =
    function MappingList_forEach(aCallback, aThisArg) {
      this._array.forEach(aCallback, aThisArg);
    };

  /**
   * Add the given source mapping.
   *
   * @param Object aMapping
   */
  MappingList.prototype.add = function MappingList_add(aMapping) {
    var mapping;
    if (generatedPositionAfter(this._last, aMapping)) {
      this._last = aMapping;
      this._array.push(aMapping);
    } else {
      this._sorted = false;
      this._array.push(aMapping);
    }
  };

  /**
   * Returns the flat, sorted array of mappings. The mappings are sorted by
   * generated position.
   *
   * WARNING: This method returns internal data without copying, for
   * performance. The return value must NOT be mutated, and should be treated as
   * an immutable borrow. If you want to take ownership, you must make your own
   * copy.
   */
  MappingList.prototype.toArray = function MappingList_toArray() {
    if (!this._sorted) {
      this._array.sort(util.compareByGeneratedPositionsInflated);
      this._sorted = true;
    }
    return this._array;
  };

  exports.MappingList = MappingList;

});

},{"./util":189,"amdefine":8}],185:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  // It turns out that some (most?) JavaScript engines don't self-host
  // `Array.prototype.sort`. This makes sense because C++ will likely remain
  // faster than JS when doing raw CPU-intensive sorting. However, when using a
  // custom comparator function, calling back and forth between the VM's C++ and
  // JIT'd JS is rather slow *and* loses JIT type information, resulting in
  // worse generated code for the comparator function than would be optimal. In
  // fact, when sorting with a comparator, these costs outweigh the benefits of
  // sorting in C++. By using our own JS-implemented Quick Sort (below), we get
  // a ~3500ms mean speed-up in `bench/bench.html`.

  /**
   * Swap the elements indexed by `x` and `y` in the array `ary`.
   *
   * @param {Array} ary
   *        The array.
   * @param {Number} x
   *        The index of the first item.
   * @param {Number} y
   *        The index of the second item.
   */
  function swap(ary, x, y) {
    var temp = ary[x];
    ary[x] = ary[y];
    ary[y] = temp;
  }

  /**
   * Returns a random integer within the range `low .. high` inclusive.
   *
   * @param {Number} low
   *        The lower bound on the range.
   * @param {Number} high
   *        The upper bound on the range.
   */
  function randomIntInRange(low, high) {
    return Math.round(low + (Math.random() * (high - low)));
  }

  /**
   * The Quick Sort algorithm.
   *
   * @param {Array} ary
   *        An array to sort.
   * @param {function} comparator
   *        Function to use to compare two items.
   * @param {Number} p
   *        Start index of the array
   * @param {Number} r
   *        End index of the array
   */
  function doQuickSort(ary, comparator, p, r) {
    // If our lower bound is less than our upper bound, we (1) partition the
    // array into two pieces and (2) recurse on each half. If it is not, this is
    // the empty array and our base case.

    if (p < r) {
      // (1) Partitioning.
      //
      // The partitioning chooses a pivot between `p` and `r` and moves all
      // elements that are less than or equal to the pivot to the before it, and
      // all the elements that are greater than it after it. The effect is that
      // once partition is done, the pivot is in the exact place it will be when
      // the array is put in sorted order, and it will not need to be moved
      // again. This runs in O(n) time.

      // Always choose a random pivot so that an input array which is reverse
      // sorted does not cause O(n^2) running time.
      var pivotIndex = randomIntInRange(p, r);
      var i = p - 1;

      swap(ary, pivotIndex, r);
      var pivot = ary[r];

      // Immediately after `j` is incremented in this loop, the following hold
      // true:
      //
      //   * Every element in `ary[p .. i]` is less than or equal to the pivot.
      //
      //   * Every element in `ary[i+1 .. j-1]` is greater than the pivot.
      for (var j = p; j < r; j++) {
        if (comparator(ary[j], pivot) <= 0) {
          i += 1;
          swap(ary, i, j);
        }
      }

      swap(ary, i + 1, j);
      var q = i + 1;

      // (2) Recurse on each half.

      doQuickSort(ary, comparator, p, q - 1);
      doQuickSort(ary, comparator, q + 1, r);
    }
  }

  /**
   * Sort the given array in-place with the given comparator function.
   *
   * @param {Array} ary
   *        An array to sort.
   * @param {function} comparator
   *        Function to use to compare two items.
   */
  exports.quickSort = function (ary, comparator) {
    doQuickSort(ary, comparator, 0, ary.length - 1);
  };

});

},{"amdefine":8}],186:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var util = require('./util');
  var binarySearch = require('./binary-search');
  var ArraySet = require('./array-set').ArraySet;
  var base64VLQ = require('./base64-vlq');
  var quickSort = require('./quick-sort').quickSort;

  function SourceMapConsumer(aSourceMap) {
    var sourceMap = aSourceMap;
    if (typeof aSourceMap === 'string') {
      sourceMap = JSON.parse(aSourceMap.replace(/^\)\]\}'/, ''));
    }

    return sourceMap.sections != null
      ? new IndexedSourceMapConsumer(sourceMap)
      : new BasicSourceMapConsumer(sourceMap);
  }

  SourceMapConsumer.fromSourceMap = function(aSourceMap) {
    return BasicSourceMapConsumer.fromSourceMap(aSourceMap);
  }

  /**
   * The version of the source mapping spec that we are consuming.
   */
  SourceMapConsumer.prototype._version = 3;

  // `__generatedMappings` and `__originalMappings` are arrays that hold the
  // parsed mapping coordinates from the source map's "mappings" attribute. They
  // are lazily instantiated, accessed via the `_generatedMappings` and
  // `_originalMappings` getters respectively, and we only parse the mappings
  // and create these arrays once queried for a source location. We jump through
  // these hoops because there can be many thousands of mappings, and parsing
  // them is expensive, so we only want to do it if we must.
  //
  // Each object in the arrays is of the form:
  //
  //     {
  //       generatedLine: The line number in the generated code,
  //       generatedColumn: The column number in the generated code,
  //       source: The path to the original source file that generated this
  //               chunk of code,
  //       originalLine: The line number in the original source that
  //                     corresponds to this chunk of generated code,
  //       originalColumn: The column number in the original source that
  //                       corresponds to this chunk of generated code,
  //       name: The name of the original symbol which generated this chunk of
  //             code.
  //     }
  //
  // All properties except for `generatedLine` and `generatedColumn` can be
  // `null`.
  //
  // `_generatedMappings` is ordered by the generated positions.
  //
  // `_originalMappings` is ordered by the original positions.

  SourceMapConsumer.prototype.__generatedMappings = null;
  Object.defineProperty(SourceMapConsumer.prototype, '_generatedMappings', {
    get: function () {
      if (!this.__generatedMappings) {
        this._parseMappings(this._mappings, this.sourceRoot);
      }

      return this.__generatedMappings;
    }
  });

  SourceMapConsumer.prototype.__originalMappings = null;
  Object.defineProperty(SourceMapConsumer.prototype, '_originalMappings', {
    get: function () {
      if (!this.__originalMappings) {
        this._parseMappings(this._mappings, this.sourceRoot);
      }

      return this.__originalMappings;
    }
  });

  SourceMapConsumer.prototype._charIsMappingSeparator =
    function SourceMapConsumer_charIsMappingSeparator(aStr, index) {
      var c = aStr.charAt(index);
      return c === ";" || c === ",";
    };

  /**
   * Parse the mappings in a string in to a data structure which we can easily
   * query (the ordered arrays in the `this.__generatedMappings` and
   * `this.__originalMappings` properties).
   */
  SourceMapConsumer.prototype._parseMappings =
    function SourceMapConsumer_parseMappings(aStr, aSourceRoot) {
      throw new Error("Subclasses must implement _parseMappings");
    };

  SourceMapConsumer.GENERATED_ORDER = 1;
  SourceMapConsumer.ORIGINAL_ORDER = 2;

  SourceMapConsumer.GREATEST_LOWER_BOUND = 1;
  SourceMapConsumer.LEAST_UPPER_BOUND = 2;

  /**
   * Iterate over each mapping between an original source/line/column and a
   * generated line/column in this source map.
   *
   * @param Function aCallback
   *        The function that is called with each mapping.
   * @param Object aContext
   *        Optional. If specified, this object will be the value of `this` every
   *        time that `aCallback` is called.
   * @param aOrder
   *        Either `SourceMapConsumer.GENERATED_ORDER` or
   *        `SourceMapConsumer.ORIGINAL_ORDER`. Specifies whether you want to
   *        iterate over the mappings sorted by the generated file's line/column
   *        order or the original's source/line/column order, respectively. Defaults to
   *        `SourceMapConsumer.GENERATED_ORDER`.
   */
  SourceMapConsumer.prototype.eachMapping =
    function SourceMapConsumer_eachMapping(aCallback, aContext, aOrder) {
      var context = aContext || null;
      var order = aOrder || SourceMapConsumer.GENERATED_ORDER;

      var mappings;
      switch (order) {
      case SourceMapConsumer.GENERATED_ORDER:
        mappings = this._generatedMappings;
        break;
      case SourceMapConsumer.ORIGINAL_ORDER:
        mappings = this._originalMappings;
        break;
      default:
        throw new Error("Unknown order of iteration.");
      }

      var sourceRoot = this.sourceRoot;
      mappings.map(function (mapping) {
        var source = mapping.source === null ? null : this._sources.at(mapping.source);
        if (source != null && sourceRoot != null) {
          source = util.join(sourceRoot, source);
        }
        return {
          source: source,
          generatedLine: mapping.generatedLine,
          generatedColumn: mapping.generatedColumn,
          originalLine: mapping.originalLine,
          originalColumn: mapping.originalColumn,
          name: mapping.name === null ? null : this._names.at(mapping.name)
        };
      }, this).forEach(aCallback, context);
    };

  /**
   * Returns all generated line and column information for the original source,
   * line, and column provided. If no column is provided, returns all mappings
   * corresponding to a either the line we are searching for or the next
   * closest line that has any mappings. Otherwise, returns all mappings
   * corresponding to the given line and either the column we are searching for
   * or the next closest column that has any offsets.
   *
   * The only argument is an object with the following properties:
   *
   *   - source: The filename of the original source.
   *   - line: The line number in the original source.
   *   - column: Optional. the column number in the original source.
   *
   * and an array of objects is returned, each with the following properties:
   *
   *   - line: The line number in the generated source, or null.
   *   - column: The column number in the generated source, or null.
   */
  SourceMapConsumer.prototype.allGeneratedPositionsFor =
    function SourceMapConsumer_allGeneratedPositionsFor(aArgs) {
      var line = util.getArg(aArgs, 'line');

      // When there is no exact match, BasicSourceMapConsumer.prototype._findMapping
      // returns the index of the closest mapping less than the needle. By
      // setting needle.originalColumn to 0, we thus find the last mapping for
      // the given line, provided such a mapping exists.
      var needle = {
        source: util.getArg(aArgs, 'source'),
        originalLine: line,
        originalColumn: util.getArg(aArgs, 'column', 0)
      };

      if (this.sourceRoot != null) {
        needle.source = util.relative(this.sourceRoot, needle.source);
      }
      if (!this._sources.has(needle.source)) {
        return [];
      }
      needle.source = this._sources.indexOf(needle.source);

      var mappings = [];

      var index = this._findMapping(needle,
                                    this._originalMappings,
                                    "originalLine",
                                    "originalColumn",
                                    util.compareByOriginalPositions,
                                    binarySearch.LEAST_UPPER_BOUND);
      if (index >= 0) {
        var mapping = this._originalMappings[index];

        if (aArgs.column === undefined) {
          var originalLine = mapping.originalLine;

          // Iterate until either we run out of mappings, or we run into
          // a mapping for a different line than the one we found. Since
          // mappings are sorted, this is guaranteed to find all mappings for
          // the line we found.
          while (mapping && mapping.originalLine === originalLine) {
            mappings.push({
              line: util.getArg(mapping, 'generatedLine', null),
              column: util.getArg(mapping, 'generatedColumn', null),
              lastColumn: util.getArg(mapping, 'lastGeneratedColumn', null)
            });

            mapping = this._originalMappings[++index];
          }
        } else {
          var originalColumn = mapping.originalColumn;

          // Iterate until either we run out of mappings, or we run into
          // a mapping for a different line than the one we were searching for.
          // Since mappings are sorted, this is guaranteed to find all mappings for
          // the line we are searching for.
          while (mapping &&
                 mapping.originalLine === line &&
                 mapping.originalColumn == originalColumn) {
            mappings.push({
              line: util.getArg(mapping, 'generatedLine', null),
              column: util.getArg(mapping, 'generatedColumn', null),
              lastColumn: util.getArg(mapping, 'lastGeneratedColumn', null)
            });

            mapping = this._originalMappings[++index];
          }
        }
      }

      return mappings;
    };

  exports.SourceMapConsumer = SourceMapConsumer;

  /**
   * A BasicSourceMapConsumer instance represents a parsed source map which we can
   * query for information about the original file positions by giving it a file
   * position in the generated source.
   *
   * The only parameter is the raw source map (either as a JSON string, or
   * already parsed to an object). According to the spec, source maps have the
   * following attributes:
   *
   *   - version: Which version of the source map spec this map is following.
   *   - sources: An array of URLs to the original source files.
   *   - names: An array of identifiers which can be referrenced by individual mappings.
   *   - sourceRoot: Optional. The URL root from which all sources are relative.
   *   - sourcesContent: Optional. An array of contents of the original source files.
   *   - mappings: A string of base64 VLQs which contain the actual mappings.
   *   - file: Optional. The generated file this source map is associated with.
   *
   * Here is an example source map, taken from the source map spec[0]:
   *
   *     {
   *       version : 3,
   *       file: "out.js",
   *       sourceRoot : "",
   *       sources: ["foo.js", "bar.js"],
   *       names: ["src", "maps", "are", "fun"],
   *       mappings: "AA,AB;;ABCDE;"
   *     }
   *
   * [0]: https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit?pli=1#
   */
  function BasicSourceMapConsumer(aSourceMap) {
    var sourceMap = aSourceMap;
    if (typeof aSourceMap === 'string') {
      sourceMap = JSON.parse(aSourceMap.replace(/^\)\]\}'/, ''));
    }

    var version = util.getArg(sourceMap, 'version');
    var sources = util.getArg(sourceMap, 'sources');
    // Sass 3.3 leaves out the 'names' array, so we deviate from the spec (which
    // requires the array) to play nice here.
    var names = util.getArg(sourceMap, 'names', []);
    var sourceRoot = util.getArg(sourceMap, 'sourceRoot', null);
    var sourcesContent = util.getArg(sourceMap, 'sourcesContent', null);
    var mappings = util.getArg(sourceMap, 'mappings');
    var file = util.getArg(sourceMap, 'file', null);

    // Once again, Sass deviates from the spec and supplies the version as a
    // string rather than a number, so we use loose equality checking here.
    if (version != this._version) {
      throw new Error('Unsupported version: ' + version);
    }

    // Some source maps produce relative source paths like "./foo.js" instead of
    // "foo.js".  Normalize these first so that future comparisons will succeed.
    // See bugzil.la/1090768.
    sources = sources.map(util.normalize);

    // Pass `true` below to allow duplicate names and sources. While source maps
    // are intended to be compressed and deduplicated, the TypeScript compiler
    // sometimes generates source maps with duplicates in them. See Github issue
    // #72 and bugzil.la/889492.
    this._names = ArraySet.fromArray(names, true);
    this._sources = ArraySet.fromArray(sources, true);

    this.sourceRoot = sourceRoot;
    this.sourcesContent = sourcesContent;
    this._mappings = mappings;
    this.file = file;
  }

  BasicSourceMapConsumer.prototype = Object.create(SourceMapConsumer.prototype);
  BasicSourceMapConsumer.prototype.consumer = SourceMapConsumer;

  /**
   * Create a BasicSourceMapConsumer from a SourceMapGenerator.
   *
   * @param SourceMapGenerator aSourceMap
   *        The source map that will be consumed.
   * @returns BasicSourceMapConsumer
   */
  BasicSourceMapConsumer.fromSourceMap =
    function SourceMapConsumer_fromSourceMap(aSourceMap) {
      var smc = Object.create(BasicSourceMapConsumer.prototype);

      var names = smc._names = ArraySet.fromArray(aSourceMap._names.toArray(), true);
      var sources = smc._sources = ArraySet.fromArray(aSourceMap._sources.toArray(), true);
      smc.sourceRoot = aSourceMap._sourceRoot;
      smc.sourcesContent = aSourceMap._generateSourcesContent(smc._sources.toArray(),
                                                              smc.sourceRoot);
      smc.file = aSourceMap._file;

      // Because we are modifying the entries (by converting string sources and
      // names to indices into the sources and names ArraySets), we have to make
      // a copy of the entry or else bad things happen. Shared mutable state
      // strikes again! See github issue #191.

      var generatedMappings = aSourceMap._mappings.toArray().slice();
      var destGeneratedMappings = smc.__generatedMappings = [];
      var destOriginalMappings = smc.__originalMappings = [];

      for (var i = 0, length = generatedMappings.length; i < length; i++) {
        var srcMapping = generatedMappings[i];
        var destMapping = new Mapping;
        destMapping.generatedLine = srcMapping.generatedLine;
        destMapping.generatedColumn = srcMapping.generatedColumn;

        if (srcMapping.source) {
          destMapping.source = sources.indexOf(srcMapping.source);
          destMapping.originalLine = srcMapping.originalLine;
          destMapping.originalColumn = srcMapping.originalColumn;

          if (srcMapping.name) {
            destMapping.name = names.indexOf(srcMapping.name);
          }

          destOriginalMappings.push(destMapping);
        }

        destGeneratedMappings.push(destMapping);
      }

      quickSort(smc.__originalMappings, util.compareByOriginalPositions);

      return smc;
    };

  /**
   * The version of the source mapping spec that we are consuming.
   */
  BasicSourceMapConsumer.prototype._version = 3;

  /**
   * The list of original sources.
   */
  Object.defineProperty(BasicSourceMapConsumer.prototype, 'sources', {
    get: function () {
      return this._sources.toArray().map(function (s) {
        return this.sourceRoot != null ? util.join(this.sourceRoot, s) : s;
      }, this);
    }
  });

  /**
   * Provide the JIT with a nice shape / hidden class.
   */
  function Mapping() {
    this.generatedLine = 0;
    this.generatedColumn = 0;
    this.source = null;
    this.originalLine = null;
    this.originalColumn = null;
    this.name = null;
  }

  /**
   * Parse the mappings in a string in to a data structure which we can easily
   * query (the ordered arrays in the `this.__generatedMappings` and
   * `this.__originalMappings` properties).
   */
  BasicSourceMapConsumer.prototype._parseMappings =
    function SourceMapConsumer_parseMappings(aStr, aSourceRoot) {
      var generatedLine = 1;
      var previousGeneratedColumn = 0;
      var previousOriginalLine = 0;
      var previousOriginalColumn = 0;
      var previousSource = 0;
      var previousName = 0;
      var length = aStr.length;
      var index = 0;
      var cachedSegments = {};
      var temp = {};
      var originalMappings = [];
      var generatedMappings = [];
      var mapping, str, segment, end, value;

      while (index < length) {
        if (aStr.charAt(index) === ';') {
          generatedLine++;
          index++;
          previousGeneratedColumn = 0;
        }
        else if (aStr.charAt(index) === ',') {
          index++;
        }
        else {
          mapping = new Mapping();
          mapping.generatedLine = generatedLine;

          // Because each offset is encoded relative to the previous one,
          // many segments often have the same encoding. We can exploit this
          // fact by caching the parsed variable length fields of each segment,
          // allowing us to avoid a second parse if we encounter the same
          // segment again.
          for (end = index; end < length; end++) {
            if (this._charIsMappingSeparator(aStr, end)) {
              break;
            }
          }
          str = aStr.slice(index, end);

          segment = cachedSegments[str];
          if (segment) {
            index += str.length;
          } else {
            segment = [];
            while (index < end) {
              base64VLQ.decode(aStr, index, temp);
              value = temp.value;
              index = temp.rest;
              segment.push(value);
            }

            if (segment.length === 2) {
              throw new Error('Found a source, but no line and column');
            }

            if (segment.length === 3) {
              throw new Error('Found a source and line, but no column');
            }

            cachedSegments[str] = segment;
          }

          // Generated column.
          mapping.generatedColumn = previousGeneratedColumn + segment[0];
          previousGeneratedColumn = mapping.generatedColumn;

          if (segment.length > 1) {
            // Original source.
            mapping.source = previousSource + segment[1];
            previousSource += segment[1];

            // Original line.
            mapping.originalLine = previousOriginalLine + segment[2];
            previousOriginalLine = mapping.originalLine;
            // Lines are stored 0-based
            mapping.originalLine += 1;

            // Original column.
            mapping.originalColumn = previousOriginalColumn + segment[3];
            previousOriginalColumn = mapping.originalColumn;

            if (segment.length > 4) {
              // Original name.
              mapping.name = previousName + segment[4];
              previousName += segment[4];
            }
          }

          generatedMappings.push(mapping);
          if (typeof mapping.originalLine === 'number') {
            originalMappings.push(mapping);
          }
        }
      }

      quickSort(generatedMappings, util.compareByGeneratedPositionsDeflated);
      this.__generatedMappings = generatedMappings;

      quickSort(originalMappings, util.compareByOriginalPositions);
      this.__originalMappings = originalMappings;
    };

  /**
   * Find the mapping that best matches the hypothetical "needle" mapping that
   * we are searching for in the given "haystack" of mappings.
   */
  BasicSourceMapConsumer.prototype._findMapping =
    function SourceMapConsumer_findMapping(aNeedle, aMappings, aLineName,
                                           aColumnName, aComparator, aBias) {
      // To return the position we are searching for, we must first find the
      // mapping for the given position and then return the opposite position it
      // points to. Because the mappings are sorted, we can use binary search to
      // find the best mapping.

      if (aNeedle[aLineName] <= 0) {
        throw new TypeError('Line must be greater than or equal to 1, got '
                            + aNeedle[aLineName]);
      }
      if (aNeedle[aColumnName] < 0) {
        throw new TypeError('Column must be greater than or equal to 0, got '
                            + aNeedle[aColumnName]);
      }

      return binarySearch.search(aNeedle, aMappings, aComparator, aBias);
    };

  /**
   * Compute the last column for each generated mapping. The last column is
   * inclusive.
   */
  BasicSourceMapConsumer.prototype.computeColumnSpans =
    function SourceMapConsumer_computeColumnSpans() {
      for (var index = 0; index < this._generatedMappings.length; ++index) {
        var mapping = this._generatedMappings[index];

        // Mappings do not contain a field for the last generated columnt. We
        // can come up with an optimistic estimate, however, by assuming that
        // mappings are contiguous (i.e. given two consecutive mappings, the
        // first mapping ends where the second one starts).
        if (index + 1 < this._generatedMappings.length) {
          var nextMapping = this._generatedMappings[index + 1];

          if (mapping.generatedLine === nextMapping.generatedLine) {
            mapping.lastGeneratedColumn = nextMapping.generatedColumn - 1;
            continue;
          }
        }

        // The last mapping for each line spans the entire line.
        mapping.lastGeneratedColumn = Infinity;
      }
    };

  /**
   * Returns the original source, line, and column information for the generated
   * source's line and column positions provided. The only argument is an object
   * with the following properties:
   *
   *   - line: The line number in the generated source.
   *   - column: The column number in the generated source.
   *   - bias: Either 'SourceMapConsumer.GREATEST_LOWER_BOUND' or
   *     'SourceMapConsumer.LEAST_UPPER_BOUND'. Specifies whether to return the
   *     closest element that is smaller than or greater than the one we are
   *     searching for, respectively, if the exact element cannot be found.
   *     Defaults to 'SourceMapConsumer.GREATEST_LOWER_BOUND'.
   *
   * and an object is returned with the following properties:
   *
   *   - source: The original source file, or null.
   *   - line: The line number in the original source, or null.
   *   - column: The column number in the original source, or null.
   *   - name: The original identifier, or null.
   */
  BasicSourceMapConsumer.prototype.originalPositionFor =
    function SourceMapConsumer_originalPositionFor(aArgs) {
      var needle = {
        generatedLine: util.getArg(aArgs, 'line'),
        generatedColumn: util.getArg(aArgs, 'column')
      };

      var index = this._findMapping(
        needle,
        this._generatedMappings,
        "generatedLine",
        "generatedColumn",
        util.compareByGeneratedPositionsDeflated,
        util.getArg(aArgs, 'bias', SourceMapConsumer.GREATEST_LOWER_BOUND)
      );

      if (index >= 0) {
        var mapping = this._generatedMappings[index];

        if (mapping.generatedLine === needle.generatedLine) {
          var source = util.getArg(mapping, 'source', null);
          if (source !== null) {
            source = this._sources.at(source);
            if (this.sourceRoot != null) {
              source = util.join(this.sourceRoot, source);
            }
          }
          var name = util.getArg(mapping, 'name', null);
          if (name !== null) {
            name = this._names.at(name);
          }
          return {
            source: source,
            line: util.getArg(mapping, 'originalLine', null),
            column: util.getArg(mapping, 'originalColumn', null),
            name: name
          };
        }
      }

      return {
        source: null,
        line: null,
        column: null,
        name: null
      };
    };

  /**
   * Return true if we have the source content for every source in the source
   * map, false otherwise.
   */
  BasicSourceMapConsumer.prototype.hasContentsOfAllSources =
    function BasicSourceMapConsumer_hasContentsOfAllSources() {
      if (!this.sourcesContent) {
        return false;
      }
      return this.sourcesContent.length >= this._sources.size() &&
        !this.sourcesContent.some(function (sc) { return sc == null; });
    };

  /**
   * Returns the original source content. The only argument is the url of the
   * original source file. Returns null if no original source content is
   * availible.
   */
  BasicSourceMapConsumer.prototype.sourceContentFor =
    function SourceMapConsumer_sourceContentFor(aSource, nullOnMissing) {
      if (!this.sourcesContent) {
        return null;
      }

      if (this.sourceRoot != null) {
        aSource = util.relative(this.sourceRoot, aSource);
      }

      if (this._sources.has(aSource)) {
        return this.sourcesContent[this._sources.indexOf(aSource)];
      }

      var url;
      if (this.sourceRoot != null
          && (url = util.urlParse(this.sourceRoot))) {
        // XXX: file:// URIs and absolute paths lead to unexpected behavior for
        // many users. We can help them out when they expect file:// URIs to
        // behave like it would if they were running a local HTTP server. See
        // https://bugzilla.mozilla.org/show_bug.cgi?id=885597.
        var fileUriAbsPath = aSource.replace(/^file:\/\//, "");
        if (url.scheme == "file"
            && this._sources.has(fileUriAbsPath)) {
          return this.sourcesContent[this._sources.indexOf(fileUriAbsPath)]
        }

        if ((!url.path || url.path == "/")
            && this._sources.has("/" + aSource)) {
          return this.sourcesContent[this._sources.indexOf("/" + aSource)];
        }
      }

      // This function is used recursively from
      // IndexedSourceMapConsumer.prototype.sourceContentFor. In that case, we
      // don't want to throw if we can't find the source - we just want to
      // return null, so we provide a flag to exit gracefully.
      if (nullOnMissing) {
        return null;
      }
      else {
        throw new Error('"' + aSource + '" is not in the SourceMap.');
      }
    };

  /**
   * Returns the generated line and column information for the original source,
   * line, and column positions provided. The only argument is an object with
   * the following properties:
   *
   *   - source: The filename of the original source.
   *   - line: The line number in the original source.
   *   - column: The column number in the original source.
   *   - bias: Either 'SourceMapConsumer.GREATEST_LOWER_BOUND' or
   *     'SourceMapConsumer.LEAST_UPPER_BOUND'. Specifies whether to return the
   *     closest element that is smaller than or greater than the one we are
   *     searching for, respectively, if the exact element cannot be found.
   *     Defaults to 'SourceMapConsumer.GREATEST_LOWER_BOUND'.
   *
   * and an object is returned with the following properties:
   *
   *   - line: The line number in the generated source, or null.
   *   - column: The column number in the generated source, or null.
   */
  BasicSourceMapConsumer.prototype.generatedPositionFor =
    function SourceMapConsumer_generatedPositionFor(aArgs) {
      var source = util.getArg(aArgs, 'source');
      if (this.sourceRoot != null) {
        source = util.relative(this.sourceRoot, source);
      }
      if (!this._sources.has(source)) {
        return {
          line: null,
          column: null,
          lastColumn: null
        };
      }
      source = this._sources.indexOf(source);

      var needle = {
        source: source,
        originalLine: util.getArg(aArgs, 'line'),
        originalColumn: util.getArg(aArgs, 'column')
      };

      var index = this._findMapping(
        needle,
        this._originalMappings,
        "originalLine",
        "originalColumn",
        util.compareByOriginalPositions,
        util.getArg(aArgs, 'bias', SourceMapConsumer.GREATEST_LOWER_BOUND)
      );

      if (index >= 0) {
        var mapping = this._originalMappings[index];

        if (mapping.source === needle.source) {
          return {
            line: util.getArg(mapping, 'generatedLine', null),
            column: util.getArg(mapping, 'generatedColumn', null),
            lastColumn: util.getArg(mapping, 'lastGeneratedColumn', null)
          };
        }
      }

      return {
        line: null,
        column: null,
        lastColumn: null
      };
    };

  exports.BasicSourceMapConsumer = BasicSourceMapConsumer;

  /**
   * An IndexedSourceMapConsumer instance represents a parsed source map which
   * we can query for information. It differs from BasicSourceMapConsumer in
   * that it takes "indexed" source maps (i.e. ones with a "sections" field) as
   * input.
   *
   * The only parameter is a raw source map (either as a JSON string, or already
   * parsed to an object). According to the spec for indexed source maps, they
   * have the following attributes:
   *
   *   - version: Which version of the source map spec this map is following.
   *   - file: Optional. The generated file this source map is associated with.
   *   - sections: A list of section definitions.
   *
   * Each value under the "sections" field has two fields:
   *   - offset: The offset into the original specified at which this section
   *       begins to apply, defined as an object with a "line" and "column"
   *       field.
   *   - map: A source map definition. This source map could also be indexed,
   *       but doesn't have to be.
   *
   * Instead of the "map" field, it's also possible to have a "url" field
   * specifying a URL to retrieve a source map from, but that's currently
   * unsupported.
   *
   * Here's an example source map, taken from the source map spec[0], but
   * modified to omit a section which uses the "url" field.
   *
   *  {
   *    version : 3,
   *    file: "app.js",
   *    sections: [{
   *      offset: {line:100, column:10},
   *      map: {
   *        version : 3,
   *        file: "section.js",
   *        sources: ["foo.js", "bar.js"],
   *        names: ["src", "maps", "are", "fun"],
   *        mappings: "AAAA,E;;ABCDE;"
   *      }
   *    }],
   *  }
   *
   * [0]: https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit#heading=h.535es3xeprgt
   */
  function IndexedSourceMapConsumer(aSourceMap) {
    var sourceMap = aSourceMap;
    if (typeof aSourceMap === 'string') {
      sourceMap = JSON.parse(aSourceMap.replace(/^\)\]\}'/, ''));
    }

    var version = util.getArg(sourceMap, 'version');
    var sections = util.getArg(sourceMap, 'sections');

    if (version != this._version) {
      throw new Error('Unsupported version: ' + version);
    }

    this._sources = new ArraySet();
    this._names = new ArraySet();

    var lastOffset = {
      line: -1,
      column: 0
    };
    this._sections = sections.map(function (s) {
      if (s.url) {
        // The url field will require support for asynchronicity.
        // See https://github.com/mozilla/source-map/issues/16
        throw new Error('Support for url field in sections not implemented.');
      }
      var offset = util.getArg(s, 'offset');
      var offsetLine = util.getArg(offset, 'line');
      var offsetColumn = util.getArg(offset, 'column');

      if (offsetLine < lastOffset.line ||
          (offsetLine === lastOffset.line && offsetColumn < lastOffset.column)) {
        throw new Error('Section offsets must be ordered and non-overlapping.');
      }
      lastOffset = offset;

      return {
        generatedOffset: {
          // The offset fields are 0-based, but we use 1-based indices when
          // encoding/decoding from VLQ.
          generatedLine: offsetLine + 1,
          generatedColumn: offsetColumn + 1
        },
        consumer: new SourceMapConsumer(util.getArg(s, 'map'))
      }
    });
  }

  IndexedSourceMapConsumer.prototype = Object.create(SourceMapConsumer.prototype);
  IndexedSourceMapConsumer.prototype.constructor = SourceMapConsumer;

  /**
   * The version of the source mapping spec that we are consuming.
   */
  IndexedSourceMapConsumer.prototype._version = 3;

  /**
   * The list of original sources.
   */
  Object.defineProperty(IndexedSourceMapConsumer.prototype, 'sources', {
    get: function () {
      var sources = [];
      for (var i = 0; i < this._sections.length; i++) {
        for (var j = 0; j < this._sections[i].consumer.sources.length; j++) {
          sources.push(this._sections[i].consumer.sources[j]);
        }
      };
      return sources;
    }
  });

  /**
   * Returns the original source, line, and column information for the generated
   * source's line and column positions provided. The only argument is an object
   * with the following properties:
   *
   *   - line: The line number in the generated source.
   *   - column: The column number in the generated source.
   *
   * and an object is returned with the following properties:
   *
   *   - source: The original source file, or null.
   *   - line: The line number in the original source, or null.
   *   - column: The column number in the original source, or null.
   *   - name: The original identifier, or null.
   */
  IndexedSourceMapConsumer.prototype.originalPositionFor =
    function IndexedSourceMapConsumer_originalPositionFor(aArgs) {
      var needle = {
        generatedLine: util.getArg(aArgs, 'line'),
        generatedColumn: util.getArg(aArgs, 'column')
      };

      // Find the section containing the generated position we're trying to map
      // to an original position.
      var sectionIndex = binarySearch.search(needle, this._sections,
        function(needle, section) {
          var cmp = needle.generatedLine - section.generatedOffset.generatedLine;
          if (cmp) {
            return cmp;
          }

          return (needle.generatedColumn -
                  section.generatedOffset.generatedColumn);
        });
      var section = this._sections[sectionIndex];

      if (!section) {
        return {
          source: null,
          line: null,
          column: null,
          name: null
        };
      }

      return section.consumer.originalPositionFor({
        line: needle.generatedLine -
          (section.generatedOffset.generatedLine - 1),
        column: needle.generatedColumn -
          (section.generatedOffset.generatedLine === needle.generatedLine
           ? section.generatedOffset.generatedColumn - 1
           : 0),
        bias: aArgs.bias
      });
    };

  /**
   * Return true if we have the source content for every source in the source
   * map, false otherwise.
   */
  IndexedSourceMapConsumer.prototype.hasContentsOfAllSources =
    function IndexedSourceMapConsumer_hasContentsOfAllSources() {
      return this._sections.every(function (s) {
        return s.consumer.hasContentsOfAllSources();
      });
    };

  /**
   * Returns the original source content. The only argument is the url of the
   * original source file. Returns null if no original source content is
   * available.
   */
  IndexedSourceMapConsumer.prototype.sourceContentFor =
    function IndexedSourceMapConsumer_sourceContentFor(aSource, nullOnMissing) {
      for (var i = 0; i < this._sections.length; i++) {
        var section = this._sections[i];

        var content = section.consumer.sourceContentFor(aSource, true);
        if (content) {
          return content;
        }
      }
      if (nullOnMissing) {
        return null;
      }
      else {
        throw new Error('"' + aSource + '" is not in the SourceMap.');
      }
    };

  /**
   * Returns the generated line and column information for the original source,
   * line, and column positions provided. The only argument is an object with
   * the following properties:
   *
   *   - source: The filename of the original source.
   *   - line: The line number in the original source.
   *   - column: The column number in the original source.
   *
   * and an object is returned with the following properties:
   *
   *   - line: The line number in the generated source, or null.
   *   - column: The column number in the generated source, or null.
   */
  IndexedSourceMapConsumer.prototype.generatedPositionFor =
    function IndexedSourceMapConsumer_generatedPositionFor(aArgs) {
      for (var i = 0; i < this._sections.length; i++) {
        var section = this._sections[i];

        // Only consider this section if the requested source is in the list of
        // sources of the consumer.
        if (section.consumer.sources.indexOf(util.getArg(aArgs, 'source')) === -1) {
          continue;
        }
        var generatedPosition = section.consumer.generatedPositionFor(aArgs);
        if (generatedPosition) {
          var ret = {
            line: generatedPosition.line +
              (section.generatedOffset.generatedLine - 1),
            column: generatedPosition.column +
              (section.generatedOffset.generatedLine === generatedPosition.line
               ? section.generatedOffset.generatedColumn - 1
               : 0)
          };
          return ret;
        }
      }

      return {
        line: null,
        column: null
      };
    };

  /**
   * Parse the mappings in a string in to a data structure which we can easily
   * query (the ordered arrays in the `this.__generatedMappings` and
   * `this.__originalMappings` properties).
   */
  IndexedSourceMapConsumer.prototype._parseMappings =
    function IndexedSourceMapConsumer_parseMappings(aStr, aSourceRoot) {
      this.__generatedMappings = [];
      this.__originalMappings = [];
      for (var i = 0; i < this._sections.length; i++) {
        var section = this._sections[i];
        var sectionMappings = section.consumer._generatedMappings;
        for (var j = 0; j < sectionMappings.length; j++) {
          var mapping = sectionMappings[i];

          var source = section.consumer._sources.at(mapping.source);
          if (section.consumer.sourceRoot !== null) {
            source = util.join(section.consumer.sourceRoot, source);
          }
          this._sources.add(source);
          source = this._sources.indexOf(source);

          var name = section.consumer._names.at(mapping.name);
          this._names.add(name);
          name = this._names.indexOf(name);

          // The mappings coming from the consumer for the section have
          // generated positions relative to the start of the section, so we
          // need to offset them to be relative to the start of the concatenated
          // generated file.
          var adjustedMapping = {
            source: source,
            generatedLine: mapping.generatedLine +
              (section.generatedOffset.generatedLine - 1),
            generatedColumn: mapping.column +
              (section.generatedOffset.generatedLine === mapping.generatedLine)
              ? section.generatedOffset.generatedColumn - 1
              : 0,
            originalLine: mapping.originalLine,
            originalColumn: mapping.originalColumn,
            name: name
          };

          this.__generatedMappings.push(adjustedMapping);
          if (typeof adjustedMapping.originalLine === 'number') {
            this.__originalMappings.push(adjustedMapping);
          }
        };
      };

      quickSort(this.__generatedMappings, util.compareByGeneratedPositionsDeflated);
      quickSort(this.__originalMappings, util.compareByOriginalPositions);
    };

  exports.IndexedSourceMapConsumer = IndexedSourceMapConsumer;

});

},{"./array-set":180,"./base64-vlq":181,"./binary-search":183,"./quick-sort":185,"./util":189,"amdefine":8}],187:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var base64VLQ = require('./base64-vlq');
  var util = require('./util');
  var ArraySet = require('./array-set').ArraySet;
  var MappingList = require('./mapping-list').MappingList;

  /**
   * An instance of the SourceMapGenerator represents a source map which is
   * being built incrementally. You may pass an object with the following
   * properties:
   *
   *   - file: The filename of the generated source.
   *   - sourceRoot: A root for all relative URLs in this source map.
   */
  function SourceMapGenerator(aArgs) {
    if (!aArgs) {
      aArgs = {};
    }
    this._file = util.getArg(aArgs, 'file', null);
    this._sourceRoot = util.getArg(aArgs, 'sourceRoot', null);
    this._skipValidation = util.getArg(aArgs, 'skipValidation', false);
    this._sources = new ArraySet();
    this._names = new ArraySet();
    this._mappings = new MappingList();
    this._sourcesContents = null;
  }

  SourceMapGenerator.prototype._version = 3;

  /**
   * Creates a new SourceMapGenerator based on a SourceMapConsumer
   *
   * @param aSourceMapConsumer The SourceMap.
   */
  SourceMapGenerator.fromSourceMap =
    function SourceMapGenerator_fromSourceMap(aSourceMapConsumer) {
      var sourceRoot = aSourceMapConsumer.sourceRoot;
      var generator = new SourceMapGenerator({
        file: aSourceMapConsumer.file,
        sourceRoot: sourceRoot
      });
      aSourceMapConsumer.eachMapping(function (mapping) {
        var newMapping = {
          generated: {
            line: mapping.generatedLine,
            column: mapping.generatedColumn
          }
        };

        if (mapping.source != null) {
          newMapping.source = mapping.source;
          if (sourceRoot != null) {
            newMapping.source = util.relative(sourceRoot, newMapping.source);
          }

          newMapping.original = {
            line: mapping.originalLine,
            column: mapping.originalColumn
          };

          if (mapping.name != null) {
            newMapping.name = mapping.name;
          }
        }

        generator.addMapping(newMapping);
      });
      aSourceMapConsumer.sources.forEach(function (sourceFile) {
        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
        if (content != null) {
          generator.setSourceContent(sourceFile, content);
        }
      });
      return generator;
    };

  /**
   * Add a single mapping from original source line and column to the generated
   * source's line and column for this source map being created. The mapping
   * object should have the following properties:
   *
   *   - generated: An object with the generated line and column positions.
   *   - original: An object with the original line and column positions.
   *   - source: The original source file (relative to the sourceRoot).
   *   - name: An optional original token name for this mapping.
   */
  SourceMapGenerator.prototype.addMapping =
    function SourceMapGenerator_addMapping(aArgs) {
      var generated = util.getArg(aArgs, 'generated');
      var original = util.getArg(aArgs, 'original', null);
      var source = util.getArg(aArgs, 'source', null);
      var name = util.getArg(aArgs, 'name', null);

      if (!this._skipValidation) {
        this._validateMapping(generated, original, source, name);
      }

      if (source != null && !this._sources.has(source)) {
        this._sources.add(source);
      }

      if (name != null && !this._names.has(name)) {
        this._names.add(name);
      }

      this._mappings.add({
        generatedLine: generated.line,
        generatedColumn: generated.column,
        originalLine: original != null && original.line,
        originalColumn: original != null && original.column,
        source: source,
        name: name
      });
    };

  /**
   * Set the source content for a source file.
   */
  SourceMapGenerator.prototype.setSourceContent =
    function SourceMapGenerator_setSourceContent(aSourceFile, aSourceContent) {
      var source = aSourceFile;
      if (this._sourceRoot != null) {
        source = util.relative(this._sourceRoot, source);
      }

      if (aSourceContent != null) {
        // Add the source content to the _sourcesContents map.
        // Create a new _sourcesContents map if the property is null.
        if (!this._sourcesContents) {
          this._sourcesContents = {};
        }
        this._sourcesContents[util.toSetString(source)] = aSourceContent;
      } else if (this._sourcesContents) {
        // Remove the source file from the _sourcesContents map.
        // If the _sourcesContents map is empty, set the property to null.
        delete this._sourcesContents[util.toSetString(source)];
        if (Object.keys(this._sourcesContents).length === 0) {
          this._sourcesContents = null;
        }
      }
    };

  /**
   * Applies the mappings of a sub-source-map for a specific source file to the
   * source map being generated. Each mapping to the supplied source file is
   * rewritten using the supplied source map. Note: The resolution for the
   * resulting mappings is the minimium of this map and the supplied map.
   *
   * @param aSourceMapConsumer The source map to be applied.
   * @param aSourceFile Optional. The filename of the source file.
   *        If omitted, SourceMapConsumer's file property will be used.
   * @param aSourceMapPath Optional. The dirname of the path to the source map
   *        to be applied. If relative, it is relative to the SourceMapConsumer.
   *        This parameter is needed when the two source maps aren't in the same
   *        directory, and the source map to be applied contains relative source
   *        paths. If so, those relative source paths need to be rewritten
   *        relative to the SourceMapGenerator.
   */
  SourceMapGenerator.prototype.applySourceMap =
    function SourceMapGenerator_applySourceMap(aSourceMapConsumer, aSourceFile, aSourceMapPath) {
      var sourceFile = aSourceFile;
      // If aSourceFile is omitted, we will use the file property of the SourceMap
      if (aSourceFile == null) {
        if (aSourceMapConsumer.file == null) {
          throw new Error(
            'SourceMapGenerator.prototype.applySourceMap requires either an explicit source file, ' +
            'or the source map\'s "file" property. Both were omitted.'
          );
        }
        sourceFile = aSourceMapConsumer.file;
      }
      var sourceRoot = this._sourceRoot;
      // Make "sourceFile" relative if an absolute Url is passed.
      if (sourceRoot != null) {
        sourceFile = util.relative(sourceRoot, sourceFile);
      }
      // Applying the SourceMap can add and remove items from the sources and
      // the names array.
      var newSources = new ArraySet();
      var newNames = new ArraySet();

      // Find mappings for the "sourceFile"
      this._mappings.unsortedForEach(function (mapping) {
        if (mapping.source === sourceFile && mapping.originalLine != null) {
          // Check if it can be mapped by the source map, then update the mapping.
          var original = aSourceMapConsumer.originalPositionFor({
            line: mapping.originalLine,
            column: mapping.originalColumn
          });
          if (original.source != null) {
            // Copy mapping
            mapping.source = original.source;
            if (aSourceMapPath != null) {
              mapping.source = util.join(aSourceMapPath, mapping.source)
            }
            if (sourceRoot != null) {
              mapping.source = util.relative(sourceRoot, mapping.source);
            }
            mapping.originalLine = original.line;
            mapping.originalColumn = original.column;
            if (original.name != null) {
              mapping.name = original.name;
            }
          }
        }

        var source = mapping.source;
        if (source != null && !newSources.has(source)) {
          newSources.add(source);
        }

        var name = mapping.name;
        if (name != null && !newNames.has(name)) {
          newNames.add(name);
        }

      }, this);
      this._sources = newSources;
      this._names = newNames;

      // Copy sourcesContents of applied map.
      aSourceMapConsumer.sources.forEach(function (sourceFile) {
        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
        if (content != null) {
          if (aSourceMapPath != null) {
            sourceFile = util.join(aSourceMapPath, sourceFile);
          }
          if (sourceRoot != null) {
            sourceFile = util.relative(sourceRoot, sourceFile);
          }
          this.setSourceContent(sourceFile, content);
        }
      }, this);
    };

  /**
   * A mapping can have one of the three levels of data:
   *
   *   1. Just the generated position.
   *   2. The Generated position, original position, and original source.
   *   3. Generated and original position, original source, as well as a name
   *      token.
   *
   * To maintain consistency, we validate that any new mapping being added falls
   * in to one of these categories.
   */
  SourceMapGenerator.prototype._validateMapping =
    function SourceMapGenerator_validateMapping(aGenerated, aOriginal, aSource,
                                                aName) {
      if (aGenerated && 'line' in aGenerated && 'column' in aGenerated
          && aGenerated.line > 0 && aGenerated.column >= 0
          && !aOriginal && !aSource && !aName) {
        // Case 1.
        return;
      }
      else if (aGenerated && 'line' in aGenerated && 'column' in aGenerated
               && aOriginal && 'line' in aOriginal && 'column' in aOriginal
               && aGenerated.line > 0 && aGenerated.column >= 0
               && aOriginal.line > 0 && aOriginal.column >= 0
               && aSource) {
        // Cases 2 and 3.
        return;
      }
      else {
        throw new Error('Invalid mapping: ' + JSON.stringify({
          generated: aGenerated,
          source: aSource,
          original: aOriginal,
          name: aName
        }));
      }
    };

  /**
   * Serialize the accumulated mappings in to the stream of base 64 VLQs
   * specified by the source map format.
   */
  SourceMapGenerator.prototype._serializeMappings =
    function SourceMapGenerator_serializeMappings() {
      var previousGeneratedColumn = 0;
      var previousGeneratedLine = 1;
      var previousOriginalColumn = 0;
      var previousOriginalLine = 0;
      var previousName = 0;
      var previousSource = 0;
      var result = '';
      var mapping;

      var mappings = this._mappings.toArray();
      for (var i = 0, len = mappings.length; i < len; i++) {
        mapping = mappings[i];

        if (mapping.generatedLine !== previousGeneratedLine) {
          previousGeneratedColumn = 0;
          while (mapping.generatedLine !== previousGeneratedLine) {
            result += ';';
            previousGeneratedLine++;
          }
        }
        else {
          if (i > 0) {
            if (!util.compareByGeneratedPositionsInflated(mapping, mappings[i - 1])) {
              continue;
            }
            result += ',';
          }
        }

        result += base64VLQ.encode(mapping.generatedColumn
                                   - previousGeneratedColumn);
        previousGeneratedColumn = mapping.generatedColumn;

        if (mapping.source != null) {
          result += base64VLQ.encode(this._sources.indexOf(mapping.source)
                                     - previousSource);
          previousSource = this._sources.indexOf(mapping.source);

          // lines are stored 0-based in SourceMap spec version 3
          result += base64VLQ.encode(mapping.originalLine - 1
                                     - previousOriginalLine);
          previousOriginalLine = mapping.originalLine - 1;

          result += base64VLQ.encode(mapping.originalColumn
                                     - previousOriginalColumn);
          previousOriginalColumn = mapping.originalColumn;

          if (mapping.name != null) {
            result += base64VLQ.encode(this._names.indexOf(mapping.name)
                                       - previousName);
            previousName = this._names.indexOf(mapping.name);
          }
        }
      }

      return result;
    };

  SourceMapGenerator.prototype._generateSourcesContent =
    function SourceMapGenerator_generateSourcesContent(aSources, aSourceRoot) {
      return aSources.map(function (source) {
        if (!this._sourcesContents) {
          return null;
        }
        if (aSourceRoot != null) {
          source = util.relative(aSourceRoot, source);
        }
        var key = util.toSetString(source);
        return Object.prototype.hasOwnProperty.call(this._sourcesContents,
                                                    key)
          ? this._sourcesContents[key]
          : null;
      }, this);
    };

  /**
   * Externalize the source map.
   */
  SourceMapGenerator.prototype.toJSON =
    function SourceMapGenerator_toJSON() {
      var map = {
        version: this._version,
        sources: this._sources.toArray(),
        names: this._names.toArray(),
        mappings: this._serializeMappings()
      };
      if (this._file != null) {
        map.file = this._file;
      }
      if (this._sourceRoot != null) {
        map.sourceRoot = this._sourceRoot;
      }
      if (this._sourcesContents) {
        map.sourcesContent = this._generateSourcesContent(map.sources, map.sourceRoot);
      }

      return map;
    };

  /**
   * Render the source map being generated to a string.
   */
  SourceMapGenerator.prototype.toString =
    function SourceMapGenerator_toString() {
      return JSON.stringify(this.toJSON());
    };

  exports.SourceMapGenerator = SourceMapGenerator;

});

},{"./array-set":180,"./base64-vlq":181,"./mapping-list":184,"./util":189,"amdefine":8}],188:[function(require,module,exports){
arguments[4][129][0].apply(exports,arguments)
},{"./source-map-generator":187,"./util":189,"amdefine":8,"dup":129}],189:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  /**
   * This is a helper function for getting values from parameter/options
   * objects.
   *
   * @param args The object we are extracting values from
   * @param name The name of the property we are getting.
   * @param defaultValue An optional value to return if the property is missing
   * from the object. If this is not specified and the property is missing, an
   * error will be thrown.
   */
  function getArg(aArgs, aName, aDefaultValue) {
    if (aName in aArgs) {
      return aArgs[aName];
    } else if (arguments.length === 3) {
      return aDefaultValue;
    } else {
      throw new Error('"' + aName + '" is a required argument.');
    }
  }
  exports.getArg = getArg;

  var urlRegexp = /^(?:([\w+\-.]+):)?\/\/(?:(\w+:\w+)@)?([\w.]*)(?::(\d+))?(\S*)$/;
  var dataUrlRegexp = /^data:.+\,.+$/;

  function urlParse(aUrl) {
    var match = aUrl.match(urlRegexp);
    if (!match) {
      return null;
    }
    return {
      scheme: match[1],
      auth: match[2],
      host: match[3],
      port: match[4],
      path: match[5]
    };
  }
  exports.urlParse = urlParse;

  function urlGenerate(aParsedUrl) {
    var url = '';
    if (aParsedUrl.scheme) {
      url += aParsedUrl.scheme + ':';
    }
    url += '//';
    if (aParsedUrl.auth) {
      url += aParsedUrl.auth + '@';
    }
    if (aParsedUrl.host) {
      url += aParsedUrl.host;
    }
    if (aParsedUrl.port) {
      url += ":" + aParsedUrl.port
    }
    if (aParsedUrl.path) {
      url += aParsedUrl.path;
    }
    return url;
  }
  exports.urlGenerate = urlGenerate;

  /**
   * Normalizes a path, or the path portion of a URL:
   *
   * - Replaces consequtive slashes with one slash.
   * - Removes unnecessary '.' parts.
   * - Removes unnecessary '<dir>/..' parts.
   *
   * Based on code in the Node.js 'path' core module.
   *
   * @param aPath The path or url to normalize.
   */
  function normalize(aPath) {
    var path = aPath;
    var url = urlParse(aPath);
    if (url) {
      if (!url.path) {
        return aPath;
      }
      path = url.path;
    }
    var isAbsolute = (path.charAt(0) === '/');

    var parts = path.split(/\/+/);
    for (var part, up = 0, i = parts.length - 1; i >= 0; i--) {
      part = parts[i];
      if (part === '.') {
        parts.splice(i, 1);
      } else if (part === '..') {
        up++;
      } else if (up > 0) {
        if (part === '') {
          // The first part is blank if the path is absolute. Trying to go
          // above the root is a no-op. Therefore we can remove all '..' parts
          // directly after the root.
          parts.splice(i + 1, up);
          up = 0;
        } else {
          parts.splice(i, 2);
          up--;
        }
      }
    }
    path = parts.join('/');

    if (path === '') {
      path = isAbsolute ? '/' : '.';
    }

    if (url) {
      url.path = path;
      return urlGenerate(url);
    }
    return path;
  }
  exports.normalize = normalize;

  /**
   * Joins two paths/URLs.
   *
   * @param aRoot The root path or URL.
   * @param aPath The path or URL to be joined with the root.
   *
   * - If aPath is a URL or a data URI, aPath is returned, unless aPath is a
   *   scheme-relative URL: Then the scheme of aRoot, if any, is prepended
   *   first.
   * - Otherwise aPath is a path. If aRoot is a URL, then its path portion
   *   is updated with the result and aRoot is returned. Otherwise the result
   *   is returned.
   *   - If aPath is absolute, the result is aPath.
   *   - Otherwise the two paths are joined with a slash.
   * - Joining for example 'http://' and 'www.example.com' is also supported.
   */
  function join(aRoot, aPath) {
    if (aRoot === "") {
      aRoot = ".";
    }
    if (aPath === "") {
      aPath = ".";
    }
    var aPathUrl = urlParse(aPath);
    var aRootUrl = urlParse(aRoot);
    if (aRootUrl) {
      aRoot = aRootUrl.path || '/';
    }

    // `join(foo, '//www.example.org')`
    if (aPathUrl && !aPathUrl.scheme) {
      if (aRootUrl) {
        aPathUrl.scheme = aRootUrl.scheme;
      }
      return urlGenerate(aPathUrl);
    }

    if (aPathUrl || aPath.match(dataUrlRegexp)) {
      return aPath;
    }

    // `join('http://', 'www.example.com')`
    if (aRootUrl && !aRootUrl.host && !aRootUrl.path) {
      aRootUrl.host = aPath;
      return urlGenerate(aRootUrl);
    }

    var joined = aPath.charAt(0) === '/'
      ? aPath
      : normalize(aRoot.replace(/\/+$/, '') + '/' + aPath);

    if (aRootUrl) {
      aRootUrl.path = joined;
      return urlGenerate(aRootUrl);
    }
    return joined;
  }
  exports.join = join;

  /**
   * Make a path relative to a URL or another path.
   *
   * @param aRoot The root path or URL.
   * @param aPath The path or URL to be made relative to aRoot.
   */
  function relative(aRoot, aPath) {
    if (aRoot === "") {
      aRoot = ".";
    }

    aRoot = aRoot.replace(/\/$/, '');

    // It is possible for the path to be above the root. In this case, simply
    // checking whether the root is a prefix of the path won't work. Instead, we
    // need to remove components from the root one by one, until either we find
    // a prefix that fits, or we run out of components to remove.
    var level = 0;
    while (aPath.indexOf(aRoot + '/') !== 0) {
      var index = aRoot.lastIndexOf("/");
      if (index < 0) {
        return aPath;
      }

      // If the only part of the root that is left is the scheme (i.e. http://,
      // file:///, etc.), one or more slashes (/), or simply nothing at all, we
      // have exhausted all components, so the path is not relative to the root.
      aRoot = aRoot.slice(0, index);
      if (aRoot.match(/^([^\/]+:\/)?\/*$/)) {
        return aPath;
      }

      ++level;
    }

    // Make sure we add a "../" for each component we removed from the root.
    return Array(level + 1).join("../") + aPath.substr(aRoot.length + 1);
  }
  exports.relative = relative;

  /**
   * Because behavior goes wacky when you set `__proto__` on objects, we
   * have to prefix all the strings in our set with an arbitrary character.
   *
   * See https://github.com/mozilla/source-map/pull/31 and
   * https://github.com/mozilla/source-map/issues/30
   *
   * @param String aStr
   */
  function toSetString(aStr) {
    return '$' + aStr;
  }
  exports.toSetString = toSetString;

  function fromSetString(aStr) {
    return aStr.substr(1);
  }
  exports.fromSetString = fromSetString;

  /**
   * Comparator between two mappings where the original positions are compared.
   *
   * Optionally pass in `true` as `onlyCompareGenerated` to consider two
   * mappings with the same original source/line/column, but different generated
   * line and column the same. Useful when searching for a mapping with a
   * stubbed out mapping.
   */
  function compareByOriginalPositions(mappingA, mappingB, onlyCompareOriginal) {
    var cmp = mappingA.source - mappingB.source;
    if (cmp !== 0) {
      return cmp;
    }

    cmp = mappingA.originalLine - mappingB.originalLine;
    if (cmp !== 0) {
      return cmp;
    }

    cmp = mappingA.originalColumn - mappingB.originalColumn;
    if (cmp !== 0 || onlyCompareOriginal) {
      return cmp;
    }

    cmp = mappingA.generatedColumn - mappingB.generatedColumn;
    if (cmp !== 0) {
      return cmp;
    }

    cmp = mappingA.generatedLine - mappingB.generatedLine;
    if (cmp !== 0) {
      return cmp;
    }

    return mappingA.name - mappingB.name;
  };
  exports.compareByOriginalPositions = compareByOriginalPositions;

  /**
   * Comparator between two mappings with deflated source and name indices where
   * the generated positions are compared.
   *
   * Optionally pass in `true` as `onlyCompareGenerated` to consider two
   * mappings with the same generated line and column, but different
   * source/name/original line and column the same. Useful when searching for a
   * mapping with a stubbed out mapping.
   */
  function compareByGeneratedPositionsDeflated(mappingA, mappingB, onlyCompareGenerated) {
    var cmp = mappingA.generatedLine - mappingB.generatedLine;
    if (cmp !== 0) {
      return cmp;
    }

    cmp = mappingA.generatedColumn - mappingB.generatedColumn;
    if (cmp !== 0 || onlyCompareGenerated) {
      return cmp;
    }

    cmp = mappingA.source - mappingB.source;
    if (cmp !== 0) {
      return cmp;
    }

    cmp = mappingA.originalLine - mappingB.originalLine;
    if (cmp !== 0) {
      return cmp;
    }

    cmp = mappingA.originalColumn - mappingB.originalColumn;
    if (cmp !== 0) {
      return cmp;
    }

    return mappingA.name - mappingB.name;
  };
  exports.compareByGeneratedPositionsDeflated = compareByGeneratedPositionsDeflated;

  function strcmp(aStr1, aStr2) {
    if (aStr1 === aStr2) {
      return 0;
    }

    if (aStr1 > aStr2) {
      return 1;
    }

    return -1;
  }

  /**
   * Comparator between two mappings with inflated source and name strings where
   * the generated positions are compared.
   */
  function compareByGeneratedPositionsInflated(mappingA, mappingB) {
    var cmp = mappingA.generatedLine - mappingB.generatedLine;
    if (cmp !== 0) {
      return cmp;
    }

    cmp = mappingA.generatedColumn - mappingB.generatedColumn;
    if (cmp !== 0) {
      return cmp;
    }

    cmp = strcmp(mappingA.source, mappingB.source);
    if (cmp !== 0) {
      return cmp;
    }

    cmp = mappingA.originalLine - mappingB.originalLine;
    if (cmp !== 0) {
      return cmp;
    }

    cmp = mappingA.originalColumn - mappingB.originalColumn;
    if (cmp !== 0) {
      return cmp;
    }

    return strcmp(mappingA.name, mappingB.name);
  };
  exports.compareByGeneratedPositionsInflated = compareByGeneratedPositionsInflated;

});

},{"amdefine":8}],190:[function(require,module,exports){
// Copyright 2014 Simon Lydell
// X11 (“MIT”) Licensed. (See LICENSE.)

var path = require("path")

"use strict"

function urix(aPath) {
  if (path.sep === "\\") {
    return aPath
      .replace(/\\/g, "/")
      .replace(/^[a-z]:\/?/i, "/")
  }
  return aPath
}

module.exports = urix

},{"path":6}],191:[function(require,module,exports){
var myth = require("myth");

var linkElem = document.querySelectorAll("link");

for (var i = 0; i < linkElem.length; ++i) {
    var item = linkElem.item(i);

    if(item.getAttribute("rel") !== "stylesheet/myth") continue;

    var link = item.getAttribute("href");

    var request = new XMLHttpRequest();
    request.open("GET", link, false);
    request.send(null);

    if (request.status !== 200) console.log("[WebMyth] Can't get myth file \"" + link +"\"");

    var styleContentElement = document.createElement("style");
    styleContentElement.innerHTML = myth(request.responseText);

    document.head.appendChild(styleContentElement);
    document.head.insertBefore(styleContentElement, item);
}
},{"myth":137}]},{},[191]);