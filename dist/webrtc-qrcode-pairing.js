// Name: TurboWarp-WebRTC-QRCode-Pairing
// ID: kubohiroyawebrtcqrcodepairing
// Description: Exchanges WebRTC offers and answers by carrying them optically as QR codes.
// By: Hiroya Kubo
// License: MPL-2.0

(function (Scratch) {
  'use strict';

  //#region src/config.ts
  var extensionConfig = {
  	id: "kubohiroyawebrtcqrcodepairing",
  	slug: "webrtc-qrcode-pairing",
  	name: "TurboWarp-WebRTC-QRCode-Pairing",
  	description: "Exchanges WebRTC offers and answers by carrying them optically as QR codes.",
  	author: "Hiroya Kubo",
  	license: "MPL-2.0",
  	unsandboxed: true,
  	docsURI: "https://kubohiroya.github.io/turbowarp-webrtc-qrcode-pairing/",
  	blockIconURI: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHJlY3QgeD0iNCIgeT0iOCIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE0IiByeD0iMyIgZmlsbD0iIzRDOTdGRiIvPjxyZWN0IHg9IjI2IiB5PSI4IiB3aWR0aD0iMTgiIGhlaWdodD0iMTQiIHJ4PSIzIiBmaWxsPSIjNTlDMDU5Ii8+PHJlY3QgeD0iMTUiIHk9IjI2IiB3aWR0aD0iMTgiIGhlaWdodD0iMTQiIHJ4PSIzIiBmaWxsPSIjRkZBQjE5Ii8+PC9zdmc+"
  };
  var block_definitions_default = {
  	extensionName: "TurboWarp-WebRTC-QRCode-Pairing",
  	blocks: [
  		{
  			"opcode": "startOfferPairing",
  			"blockType": "COMMAND",
  			"text": "start offer pairing [SESSION] as [LOCAL_PEER] to [REMOTE_PEER]",
  			"description": "Creates a WebRTC offer for the integration machine and prepares it as a Structured Append sequence of QR codes.",
  			"arguments": {
  				"SESSION": {
  					"type": "STRING",
  					"defaultValue": "pairing-1"
  				},
  				"LOCAL_PEER": {
  					"type": "STRING",
  					"defaultValue": "hub"
  				},
  				"REMOTE_PEER": {
  					"type": "STRING",
  					"defaultValue": "camera-1"
  				}
  			}
  		},
  		{
  			"opcode": "startAnswerPairing",
  			"blockType": "COMMAND",
  			"text": "start answer pairing [SESSION] as [LOCAL_PEER]",
  			"description": "Waits for an offer on the camera machine. Leave the name empty to adopt the name the offer assigns.",
  			"arguments": {
  				"SESSION": {
  					"type": "STRING",
  					"defaultValue": "pairing-1"
  				},
  				"LOCAL_PEER": {
  					"type": "STRING",
  					"defaultValue": ""
  				}
  			}
  		},
  		{
  			"opcode": "ingestPairingQrText",
  			"blockType": "COMMAND",
  			"text": "receive pairing message [TEXT] for [SESSION]",
  			"description": "Accepts a whole pairing message as text, such as one pasted or carried some other way. Camera scanning reads the QR codes of a sequence itself.",
  			"arguments": {
  				"TEXT": {
  					"type": "STRING",
  					"defaultValue": ""
  				},
  				"SESSION": {
  					"type": "STRING",
  					"defaultValue": "pairing-1"
  				}
  			}
  		},
  		{
  			"opcode": "scanPairingQrFromCamera",
  			"blockType": "COMMAND",
  			"text": "scan pairing QR for [SESSION] from camera [CAMERA_ID]",
  			"description": "Reads QR codes from the named camera, in any order, until the exchange has every code of the sequence. Codes of other sequences are reported and ignored.",
  			"arguments": {
  				"SESSION": {
  					"type": "STRING",
  					"defaultValue": "pairing-1"
  				},
  				"CAMERA_ID": {
  					"type": "STRING",
  					"defaultValue": "default"
  				}
  			}
  		},
  		{
  			"opcode": "pairingReceivedParts",
  			"blockType": "REPORTER",
  			"text": "received parts of [SESSION]",
  			"description": "Returns how many distinct codes of the incoming sequence have been read.",
  			"arguments": { "SESSION": {
  				"type": "STRING",
  				"defaultValue": "pairing-1"
  			} }
  		},
  		{
  			"opcode": "pairingRequiredParts",
  			"blockType": "REPORTER",
  			"text": "required parts of [SESSION]",
  			"description": "Returns how many codes the incoming sequence has, or zero before the first code arrives.",
  			"arguments": { "SESSION": {
  				"type": "STRING",
  				"defaultValue": "pairing-1"
  			} }
  		},
  		{
  			"opcode": "pairingMissingParts",
  			"blockType": "REPORTER",
  			"text": "missing parts of [SESSION]",
  			"description": "Returns the one-based code numbers that have not been read yet, separated by commas.",
  			"arguments": { "SESSION": {
  				"type": "STRING",
  				"defaultValue": "pairing-1"
  			} }
  		},
  		{
  			"opcode": "pairingReadCount",
  			"blockType": "REPORTER",
  			"text": "pairing QR reads of [SESSION]",
  			"description": "Returns how many pairing QR codes this session has read, of any result. It rises by one per read, so a change means there is a new result to show.",
  			"arguments": { "SESSION": {
  				"type": "STRING",
  				"defaultValue": "pairing-1"
  			} }
  		},
  		{
  			"opcode": "pairingLastRead",
  			"blockType": "REPORTER",
  			"text": "last pairing QR read of [SESSION]",
  			"description": "Returns what the latest pairing QR code was: accepted (a new code of the sequence), duplicate (a code already read), foreign (a code this exchange cannot use, which is ignored), or an empty string before the first read. QR codes that are not pairing codes are not reported.",
  			"arguments": { "SESSION": {
  				"type": "STRING",
  				"defaultValue": "pairing-1"
  			} }
  		},
  		{
  			"opcode": "pairingLastReadDetail",
  			"blockType": "REPORTER",
  			"text": "last pairing QR read detail of [SESSION]",
  			"description": "Returns the code as \"2 / 4\" for accepted and duplicate reads, or why a foreign code was ignored as an error code such as message-mismatch (another sequence), stale-exchange or peer-mismatch.",
  			"arguments": { "SESSION": {
  				"type": "STRING",
  				"defaultValue": "pairing-1"
  			} }
  		},
  		{
  			"opcode": "showPairingQrPart",
  			"blockType": "COMMAND",
  			"text": "show pairing QR part [INDEX] of [SESSION] on this sprite",
  			"description": "Shows the selected one-based code of the sequence using a temporary sprite skin.",
  			"arguments": {
  				"INDEX": {
  					"type": "NUMBER",
  					"defaultValue": 1
  				},
  				"SESSION": {
  					"type": "STRING",
  					"defaultValue": "pairing-1"
  				}
  			}
  		},
  		{
  			"opcode": "showNextPairingQrPart",
  			"blockType": "COMMAND",
  			"text": "show next pairing QR part of [SESSION] on this sprite",
  			"description": "Shows the next code and wraps from the last back to the first, so a loop with a short wait cycles the whole sequence.",
  			"arguments": { "SESSION": {
  				"type": "STRING",
  				"defaultValue": "pairing-1"
  			} }
  		},
  		{
  			"opcode": "pairingQrPartCount",
  			"blockType": "REPORTER",
  			"text": "pairing QR part count of [SESSION]",
  			"description": "Returns how many codes are prepared for display, or zero when none are.",
  			"arguments": { "SESSION": {
  				"type": "STRING",
  				"defaultValue": "pairing-1"
  			} }
  		},
  		{
  			"opcode": "pairingQrCurrentPart",
  			"blockType": "REPORTER",
  			"text": "current pairing QR part of [SESSION]",
  			"description": "Returns the one-based code selected for display, or zero when none is selected.",
  			"arguments": { "SESSION": {
  				"type": "STRING",
  				"defaultValue": "pairing-1"
  			} }
  		},
  		{
  			"opcode": "pairingQrPartSvg",
  			"blockType": "REPORTER",
  			"text": "pairing QR part [INDEX] of [SESSION] as SVG",
  			"description": "Returns the code as SVG markup so a project can display it its own way.",
  			"arguments": {
  				"INDEX": {
  					"type": "NUMBER",
  					"defaultValue": 1
  				},
  				"SESSION": {
  					"type": "STRING",
  					"defaultValue": "pairing-1"
  				}
  			}
  		},
  		{
  			"opcode": "pairingQrPartDataUri",
  			"blockType": "REPORTER",
  			"text": "pairing QR part [INDEX] of [SESSION] as data URI",
  			"description": "Returns the code as a base64 SVG data URI for costumes and HTML images.",
  			"arguments": {
  				"INDEX": {
  					"type": "NUMBER",
  					"defaultValue": 1
  				},
  				"SESSION": {
  					"type": "STRING",
  					"defaultValue": "pairing-1"
  				}
  			}
  		},
  		{
  			"opcode": "endPairingQrDisplay",
  			"blockType": "COMMAND",
  			"text": "end pairing QR display of [SESSION]",
  			"description": "Restores the sprites this session changed. The session itself stays open.",
  			"arguments": { "SESSION": {
  				"type": "STRING",
  				"defaultValue": "pairing-1"
  			} }
  		},
  		{
  			"opcode": "pairingPhase",
  			"blockType": "REPORTER",
  			"text": "pairing phase of [SESSION]",
  			"description": "Returns the session phase, such as offer-ready, receiving, answer-ready, connecting, or connected.",
  			"arguments": { "SESSION": {
  				"type": "STRING",
  				"defaultValue": "pairing-1"
  			} }
  		},
  		{
  			"opcode": "pairingConnectionState",
  			"blockType": "REPORTER",
  			"text": "pairing connection state of [SESSION]",
  			"description": "Returns the WebRTC connection state reported for this session's peer.",
  			"arguments": { "SESSION": {
  				"type": "STRING",
  				"defaultValue": "pairing-1"
  			} }
  		},
  		{
  			"opcode": "isPairingConnected",
  			"blockType": "BOOLEAN",
  			"text": "pairing [SESSION] connected?",
  			"description": "Reports whether WebRTC has established the connection for this session.",
  			"arguments": { "SESSION": {
  				"type": "STRING",
  				"defaultValue": "pairing-1"
  			} }
  		},
  		{
  			"opcode": "waitUntilPairingConnected",
  			"blockType": "COMMAND",
  			"text": "wait until pairing [SESSION] is connected",
  			"description": "Waits for the connection, or fails when the session is cancelled, times out, or fails.",
  			"arguments": { "SESSION": {
  				"type": "STRING",
  				"defaultValue": "pairing-1"
  			} }
  		},
  		{
  			"opcode": "pairingError",
  			"blockType": "REPORTER",
  			"text": "pairing error code of [SESSION]",
  			"description": "Returns the latest error code, such as hash-mismatch or peer-mismatch, or an empty string.",
  			"arguments": { "SESSION": {
  				"type": "STRING",
  				"defaultValue": "pairing-1"
  			} }
  		},
  		{
  			"opcode": "pairingErrorMessage",
  			"blockType": "REPORTER",
  			"text": "pairing error message of [SESSION]",
  			"description": "Returns the latest error message. Pairing codes and QR payloads are never included.",
  			"arguments": { "SESSION": {
  				"type": "STRING",
  				"defaultValue": "pairing-1"
  			} }
  		},
  		{
  			"opcode": "pairingLocalPeer",
  			"blockType": "REPORTER",
  			"text": "local peer of [SESSION]",
  			"description": "Returns the name this machine uses for itself in this exchange.",
  			"arguments": { "SESSION": {
  				"type": "STRING",
  				"defaultValue": "pairing-1"
  			} }
  		},
  		{
  			"opcode": "pairingRemotePeer",
  			"blockType": "REPORTER",
  			"text": "remote peer of [SESSION]",
  			"description": "Returns the name this machine uses for the other machine, which is also its WebRTC peer name.",
  			"arguments": { "SESSION": {
  				"type": "STRING",
  				"defaultValue": "pairing-1"
  			} }
  		},
  		{
  			"opcode": "pairingExchangeId",
  			"blockType": "REPORTER",
  			"text": "exchange id of [SESSION]",
  			"description": "Returns the identifier of the current offer and answer exchange. A retry allocates a new one.",
  			"arguments": { "SESSION": {
  				"type": "STRING",
  				"defaultValue": "pairing-1"
  			} }
  		},
  		{
  			"opcode": "pairingRemainingSeconds",
  			"blockType": "REPORTER",
  			"text": "remaining seconds of [SESSION]",
  			"description": "Returns the seconds left before the exchange times out.",
  			"arguments": { "SESSION": {
  				"type": "STRING",
  				"defaultValue": "pairing-1"
  			} }
  		},
  		{
  			"opcode": "pairingSessions",
  			"blockType": "REPORTER",
  			"text": "pairing sessions",
  			"description": "Returns the open session names, separated by commas.",
  			"arguments": {}
  		},
  		{
  			"opcode": "cancelPairing",
  			"blockType": "COMMAND",
  			"text": "cancel pairing [SESSION]",
  			"description": "Cancels the exchange and releases displays, buffers, and unconnected peers. Established connections stay up.",
  			"arguments": { "SESSION": {
  				"type": "STRING",
  				"defaultValue": "pairing-1"
  			} }
  		},
  		{
  			"opcode": "retryPairing",
  			"blockType": "COMMAND",
  			"text": "retry pairing [SESSION]",
  			"description": "Starts a new exchange for the same session. QR codes from the previous exchange stop being accepted.",
  			"arguments": { "SESSION": {
  				"type": "STRING",
  				"defaultValue": "pairing-1"
  			} }
  		},
  		{
  			"opcode": "setPairingTimeout",
  			"blockType": "COMMAND",
  			"text": "set pairing timeout of [SESSION] to [SECONDS] seconds",
  			"description": "Sets how long the exchange waits, measured on this machine's own clock.",
  			"arguments": {
  				"SESSION": {
  					"type": "STRING",
  					"defaultValue": "pairing-1"
  				},
  				"SECONDS": {
  					"type": "NUMBER",
  					"defaultValue": 600
  				}
  			}
  		}
  	]
  };
  //#endregion
  //#region src/config/feature-flags.ts
  var overrides = globalThis.__TWQP_FEATURE_FLAGS__;
  /**
  * Startup-fixed flags, read once and frozen. The QR pairing path stays opt-in
  * until it is verified on hardware; turning it off is a route switch back to
  * manual offer/answer exchange, not a disconnect of established connections.
  */
  var featureFlags = Object.freeze({ qrCodePairing: overrides?.qrCodePairing === true });
  //#endregion
  //#region src/clock.ts
  var systemMonotonicClock = { nowMilliseconds: () => typeof performance === "object" && typeof performance.now === "function" ? performance.now() : Date.now() };
  //#endregion
  //#region src/qr/limits.ts
  /**
  * Largest carried pairing code. Boundary: 1 <= length <= MAX_MESSAGE_LENGTH.
  *
  * The version cap binds long before this: sixteen codes of version 15 at level
  * M carry about 6,500 bytes, and of version 20 about 10,600, against a pairing
  * code of about 1,250 characters. A longer code fails while splitting with
  * `too-many-parts`.
  */
  var MAX_MESSAGE_LENGTH = 32768;
  //#endregion
  //#region src/config/qr-config.ts
  var configured = globalThis.__TWQP_QR_CONFIG__;
  /**
  * Startup-fixed QR settings. M is the software-validated default; higher levels
  * survive worse optical conditions but carry fewer characters per code, which
  * raises the number of codes. The version caps trade the other way: a lower
  * cap makes each code coarser and easier for a camera to read, in more codes.
  * The offer and the answer have their own caps, because the offer is cycled
  * automatically and the answer is turned by hand. A value that is not a level,
  * or not a version from 1 to 40, falls back to the default rather than failing
  * the extension at load.
  */
  var qrConfig = Object.freeze({
  	errorCorrectionLevel: isLevel(configured?.errorCorrectionLevel) ? configured.errorCorrectionLevel : "M",
  	offerMaxVersion: isVersion(configured?.offerMaxVersion) ? configured.offerMaxVersion : 15,
  	answerMaxVersion: isVersion(configured?.answerMaxVersion) ? configured.answerMaxVersion : 20
  });
  function isLevel(value) {
  	return value === "L" || value === "M" || value === "Q" || value === "H";
  }
  function isVersion(value) {
  	return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 40;
  }
  //#endregion
  //#region src/errors.ts
  var QrPairingError = class extends Error {
  	constructor(code, message, options) {
  		super(message, options);
  		this.name = "QrPairingError";
  		this.code = code;
  	}
  };
  //#endregion
  //#region \0@oxc-project+runtime@0.148.0/helpers/esm/checkPrivateRedeclaration.js
  function _checkPrivateRedeclaration(e, t) {
  	if (t.has(e)) throw new TypeError("Cannot initialize the same private elements twice on an object");
  }
  //#endregion
  //#region \0@oxc-project+runtime@0.148.0/helpers/esm/classPrivateFieldInitSpec.js
  function _classPrivateFieldInitSpec(e, t, a) {
  	_checkPrivateRedeclaration(e, t), t.set(e, a);
  }
  //#endregion
  //#region \0@oxc-project+runtime@0.148.0/helpers/esm/assertClassBrand.js
  function _assertClassBrand(e, t, n) {
  	if ("function" == typeof e ? e === t : e.has(t)) return arguments.length < 3 ? t : n;
  	throw new TypeError("Private element is not present on this object");
  }
  //#endregion
  //#region \0@oxc-project+runtime@0.148.0/helpers/esm/classPrivateFieldSet2.js
  function _classPrivateFieldSet2(s, a, r) {
  	return s.set(_assertClassBrand(s, a), r), r;
  }
  //#endregion
  //#region \0@oxc-project+runtime@0.148.0/helpers/esm/classPrivateFieldGet2.js
  function _classPrivateFieldGet2(s, a) {
  	return s.get(_assertClassBrand(s, a));
  }
  //#endregion
  //#region \0@oxc-project+runtime@0.148.0/helpers/esm/typeof.js
  function _typeof(o) {
  	"@babel/helpers - typeof";
  	return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
  		return typeof o;
  	} : function(o) {
  		return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
  	}, _typeof(o);
  }
  //#endregion
  //#region \0@oxc-project+runtime@0.148.0/helpers/esm/toPrimitive.js
  function toPrimitive(t, r) {
  	if ("object" != _typeof(t) || !t) return t;
  	var e = t[Symbol.toPrimitive];
  	if (void 0 !== e) {
  		var i = e.call(t, r || "default");
  		if ("object" != _typeof(i)) return i;
  		throw new TypeError("@@toPrimitive must return a primitive value.");
  	}
  	return ("string" === r ? String : Number)(t);
  }
  //#endregion
  //#region \0@oxc-project+runtime@0.148.0/helpers/esm/toPropertyKey.js
  function toPropertyKey(t) {
  	var i = toPrimitive(t, "string");
  	return "symbol" == _typeof(i) ? i : i + "";
  }
  //#endregion
  //#region \0@oxc-project+runtime@0.148.0/helpers/esm/defineProperty.js
  function _defineProperty(e, r, t) {
  	return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
  		value: t,
  		enumerable: !0,
  		configurable: !0,
  		writable: !0
  	}) : e[r] = t, e;
  }
  //#endregion
  //#region \0@oxc-project+runtime@0.148.0/helpers/esm/classPrivateMethodInitSpec.js
  function _classPrivateMethodInitSpec(e, a) {
  	_checkPrivateRedeclaration(e, a), a.add(e);
  }
  //#endregion
  //#region node_modules/.pnpm/@kubohiroya+qrcode-structured-append@0.1.0/node_modules/@kubohiroya/qrcode-structured-append/dist/index.js
  var _Charset;
  var _label;
  var _values;
  var _Mode;
  var _bits;
  var _characterCountBitsSet;
  var _ECLevel;
  var _bits2;
  var _level;
  var _name;
  var _count;
  var _numDataCodewords;
  var _ecBlocks;
  var _numTotalCodewords;
  var _numTotalECCodewords;
  var _numTotalDataCodewords;
  var _numECCodewordsPerBlock;
  var _size;
  var _version;
  var _ecBlocks2;
  var _alignmentPatterns;
  var _field;
  var _coefficients;
  var _size2;
  var _one;
  var _zero;
  var _generator;
  var _expTable;
  var _logTable;
  var _length;
  var _bits3;
  var _BitArray_brand;
  var _size3;
  var _bytes;
  var _ecCodewords;
  var _dataCodewords;
  var _field2;
  var _generators;
  var _bof;
  var _eof;
  var _bits4;
  var _depth;
  var _size4;
  var _unused;
  var _codes;
  var _bits5;
  var _dict;
  var _buffer;
  var _bytes2;
  var _bytes3;
  var _bits6;
  var _buffer2;
  var _length2;
  var _stream;
  var _width;
  var _height;
  var _foreground;
  var _background;
  var _pixels;
  var _Class_brand;
  var _mask;
  var _level2;
  var _version2;
  var _matrix;
  var _hints;
  var _level3;
  var _encode2;
  var _version3;
  var _content;
  var _charset;
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module Charset
  */
  var VALUES_TO_CHARSET = /* @__PURE__ */ new Map();
  var Charset = (_label = /* @__PURE__ */ new WeakMap(), _values = /* @__PURE__ */ new WeakMap(), _Charset = class Charset {
  	/**
  	* @constructor
  	* @param label The label of charset.
  	* @param values The values of charset.
  	*/
  	constructor(label, ...values) {
  		_classPrivateFieldInitSpec(this, _label, void 0);
  		_classPrivateFieldInitSpec(this, _values, void 0);
  		_classPrivateFieldSet2(_label, this, label);
  		_classPrivateFieldSet2(_values, this, Object.freeze(values));
  		for (const value of values) if (value >= 0 && value <= 999999 && Number.isInteger(value)) VALUES_TO_CHARSET.set(value, this);
  		else throw new Error("illegal extended channel interpretation value");
  	}
  	/**
  	* @property label
  	* @description Get the label of charset.
  	*/
  	get label() {
  		return _classPrivateFieldGet2(_label, this);
  	}
  	/**
  	* @property values
  	* @description Get the values of charset.
  	*/
  	get values() {
  		return _classPrivateFieldGet2(_values, this);
  	}
  }, _defineProperty(_Charset, "CP437", new _Charset("cp437", 2, 0)), _defineProperty(_Charset, "ISO_8859_1", new _Charset("iso-8859-1", 3, 1)), _defineProperty(_Charset, "ISO_8859_2", new _Charset("iso-8859-2", 4)), _defineProperty(_Charset, "ISO_8859_3", new _Charset("iso-8859-3", 5)), _defineProperty(_Charset, "ISO_8859_4", new _Charset("iso-8859-4", 6)), _defineProperty(_Charset, "ISO_8859_5", new _Charset("iso-8859-5", 7)), _defineProperty(_Charset, "ISO_8859_6", new _Charset("iso-8859-6", 8)), _defineProperty(_Charset, "ISO_8859_7", new _Charset("iso-8859-7", 9)), _defineProperty(_Charset, "ISO_8859_8", new _Charset("iso-8859-8", 10)), _defineProperty(_Charset, "ISO_8859_9", new _Charset("iso-8859-9", 11)), _defineProperty(_Charset, "ISO_8859_10", new _Charset("iso-8859-10", 12)), _defineProperty(_Charset, "ISO_8859_11", new _Charset("iso-8859-11", 13)), _defineProperty(_Charset, "ISO_8859_13", new _Charset("iso-8859-13", 15)), _defineProperty(_Charset, "ISO_8859_14", new _Charset("iso-8859-14", 16)), _defineProperty(_Charset, "ISO_8859_15", new _Charset("iso-8859-15", 17)), _defineProperty(_Charset, "ISO_8859_16", new _Charset("iso-8859-16", 18)), _defineProperty(_Charset, "SHIFT_JIS", new _Charset("shift-jis", 20)), _defineProperty(_Charset, "CP1250", new _Charset("cp1250", 21)), _defineProperty(_Charset, "CP1251", new _Charset("cp1251", 22)), _defineProperty(_Charset, "CP1252", new _Charset("cp1252", 23)), _defineProperty(_Charset, "CP1256", new _Charset("cp1256", 24)), _defineProperty(_Charset, "UTF_16BE", new _Charset("utf-16be", 25)), _defineProperty(_Charset, "UTF_8", new _Charset("utf-8", 26)), _defineProperty(_Charset, "ASCII", new _Charset("ascii", 27)), _defineProperty(_Charset, "BIG5", new _Charset("big5", 28)), _defineProperty(_Charset, "GB2312", new _Charset("gb2312", 29)), _defineProperty(_Charset, "EUC_KR", new _Charset("euc-kr", 30)), _defineProperty(_Charset, "GBK", new _Charset("gbk", 31)), _defineProperty(_Charset, "GB18030", new _Charset("gb18030", 32)), _defineProperty(_Charset, "UTF_16LE", new _Charset("utf-16le", 33)), _defineProperty(_Charset, "UTF_32BE", new _Charset("utf-32be", 34)), _defineProperty(_Charset, "UTF_32LE", new _Charset("utf-32le", 35)), _defineProperty(_Charset, "ISO_646_INV", new _Charset("iso-646-inv", 170)), _defineProperty(_Charset, "BINARY", new _Charset("binary", 899)), _Charset);
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module Mode
  */
  var VALUES_TO_MODE = /* @__PURE__ */ new Map();
  var Mode = (_bits = /* @__PURE__ */ new WeakMap(), _characterCountBitsSet = /* @__PURE__ */ new WeakMap(), _Mode = class Mode {
  	constructor(characterCountBitsSet, bits) {
  		_classPrivateFieldInitSpec(this, _bits, void 0);
  		_classPrivateFieldInitSpec(this, _characterCountBitsSet, void 0);
  		_classPrivateFieldSet2(_bits, this, bits);
  		_classPrivateFieldSet2(_characterCountBitsSet, this, new Int32Array(characterCountBitsSet));
  		VALUES_TO_MODE.set(bits, this);
  	}
  	get bits() {
  		return _classPrivateFieldGet2(_bits, this);
  	}
  	getCharacterCountBits({ version }) {
  		let offset;
  		if (version <= 9) offset = 0;
  		else if (version <= 26) offset = 1;
  		else offset = 2;
  		return _classPrivateFieldGet2(_characterCountBitsSet, this)[offset];
  	}
  }, _defineProperty(_Mode, "TERMINATOR", new _Mode([
  	0,
  	0,
  	0
  ], 0)), _defineProperty(_Mode, "NUMERIC", new _Mode([
  	10,
  	12,
  	14
  ], 1)), _defineProperty(_Mode, "ALPHANUMERIC", new _Mode([
  	9,
  	11,
  	13
  ], 2)), _defineProperty(_Mode, "STRUCTURED_APPEND", new _Mode([
  	0,
  	0,
  	0
  ], 3)), _defineProperty(_Mode, "BYTE", new _Mode([
  	8,
  	16,
  	16
  ], 4)), _defineProperty(_Mode, "ECI", new _Mode([
  	0,
  	0,
  	0
  ], 7)), _defineProperty(_Mode, "KANJI", new _Mode([
  	8,
  	10,
  	12
  ], 8)), _defineProperty(_Mode, "FNC1_FIRST_POSITION", new _Mode([
  	0,
  	0,
  	0
  ], 5)), _defineProperty(_Mode, "FNC1_SECOND_POSITION", new _Mode([
  	0,
  	0,
  	0
  ], 9)), _defineProperty(_Mode, "HANZI", new _Mode([
  	8,
  	10,
  	12
  ], 13)), _Mode);
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module utils
  */
  function toBit(value) {
  	return value & 1;
  }
  function toInt32(value) {
  	return value | 0;
  }
  function getBitMask(value) {
  	return 1 << getBitOffset(value);
  }
  function getBitOffset(value) {
  	return value & 31;
  }
  function findMSBSet(value) {
  	return 32 - Math.clz32(value);
  }
  function calculateBCHCode(value, poly) {
  	const msbSetInPoly = findMSBSet(poly);
  	value <<= msbSetInPoly - 1;
  	while (findMSBSet(value) >= msbSetInPoly) value ^= poly << findMSBSet(value) - msbSetInPoly;
  	return value;
  }
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module mask
  */
  var N1 = 3;
  var N2 = 3;
  var N3 = 40;
  var N4 = 10;
  function isDark(matrix, x, y) {
  	return matrix.get(x, y) === 1;
  }
  function applyMaskPenaltyRule1Internal(matrix, isVertical) {
  	let penalty = 0;
  	const { size } = matrix;
  	for (let y = 0; y < size; y++) {
  		let prevBit = -1;
  		let numSameBitCells = 0;
  		for (let x = 0; x < size; x++) {
  			const bit = isVertical ? matrix.get(y, x) : matrix.get(x, y);
  			if (bit === prevBit) numSameBitCells++;
  			else {
  				if (numSameBitCells >= 5) penalty += N1 + (numSameBitCells - 5);
  				prevBit = bit;
  				numSameBitCells = 1;
  			}
  		}
  		if (numSameBitCells >= 5) penalty += N1 + (numSameBitCells - 5);
  	}
  	return penalty;
  }
  function applyMaskPenaltyRule1(matrix) {
  	return applyMaskPenaltyRule1Internal(matrix) + applyMaskPenaltyRule1Internal(matrix, true);
  }
  function applyMaskPenaltyRule2(matrix) {
  	let penalty = 0;
  	const size = matrix.size - 1;
  	for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  		const bit = matrix.get(x, y);
  		if (bit === matrix.get(x + 1, y) && bit === matrix.get(x, y + 1) && bit === matrix.get(x + 1, y + 1)) penalty += N2;
  	}
  	return penalty;
  }
  function isFourWhite(matrix, offset, from, to, isVertical) {
  	if (from < 0 || to > matrix.size) return false;
  	for (let i = from; i < to; i++) if (isVertical ? isDark(matrix, offset, i) : isDark(matrix, i, offset)) return false;
  	return true;
  }
  function applyMaskPenaltyRule3(matrix) {
  	let numPenalties = 0;
  	const { size } = matrix;
  	for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  		if (x + 6 < size && isDark(matrix, x, y) && !isDark(matrix, x + 1, y) && isDark(matrix, x + 2, y) && isDark(matrix, x + 3, y) && isDark(matrix, x + 4, y) && !isDark(matrix, x + 5, y) && isDark(matrix, x + 6, y) && (isFourWhite(matrix, y, x - 4, x) || isFourWhite(matrix, y, x + 7, x + 11))) numPenalties++;
  		if (y + 6 < size && isDark(matrix, x, y) && !isDark(matrix, x, y + 1) && isDark(matrix, x, y + 2) && isDark(matrix, x, y + 3) && isDark(matrix, x, y + 4) && !isDark(matrix, x, y + 5) && isDark(matrix, x, y + 6) && (isFourWhite(matrix, x, y - 4, y, true) || isFourWhite(matrix, x, y + 7, y + 11, true))) numPenalties++;
  	}
  	return numPenalties * N3;
  }
  function applyMaskPenaltyRule4(matrix) {
  	let numDarkCells = 0;
  	const { size } = matrix;
  	for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (isDark(matrix, x, y)) numDarkCells++;
  	const numTotalCells = size * size;
  	return toInt32(Math.abs(numDarkCells * 2 - numTotalCells) * 10 / numTotalCells) * N4;
  }
  function calculateMaskPenalty(matrix) {
  	return applyMaskPenaltyRule1(matrix) + applyMaskPenaltyRule2(matrix) + applyMaskPenaltyRule3(matrix) + applyMaskPenaltyRule4(matrix);
  }
  function isApplyMask(mask, x, y) {
  	let temporary;
  	let intermediate;
  	switch (mask) {
  		case 0:
  			intermediate = y + x & 1;
  			break;
  		case 1:
  			intermediate = y & 1;
  			break;
  		case 2:
  			intermediate = x % 3;
  			break;
  		case 3:
  			intermediate = (y + x) % 3;
  			break;
  		case 4:
  			intermediate = toInt32(y / 2) + toInt32(x / 3) & 1;
  			break;
  		case 5:
  			temporary = y * x;
  			intermediate = (temporary & 1) + temporary % 3;
  			break;
  		case 6:
  			temporary = y * x;
  			intermediate = (temporary & 1) + temporary % 3 & 1;
  			break;
  		case 7:
  			intermediate = y * x % 3 + (y + x & 1) & 1;
  			break;
  		default: throw new Error(`illegal mask: ${mask}`);
  	}
  	return intermediate === 0;
  }
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module ECLevel
  */
  var VALUES_TO_ECLEVEL = /* @__PURE__ */ new Map();
  var ECLevel = (_bits2 = /* @__PURE__ */ new WeakMap(), _level = /* @__PURE__ */ new WeakMap(), _name = /* @__PURE__ */ new WeakMap(), _ECLevel = class ECLevel {
  	constructor(name, level, bits) {
  		_classPrivateFieldInitSpec(this, _bits2, void 0);
  		_classPrivateFieldInitSpec(this, _level, void 0);
  		_classPrivateFieldInitSpec(this, _name, void 0);
  		_classPrivateFieldSet2(_bits2, this, bits);
  		_classPrivateFieldSet2(_name, this, name);
  		_classPrivateFieldSet2(_level, this, level);
  		VALUES_TO_ECLEVEL.set(bits, this);
  	}
  	get bits() {
  		return _classPrivateFieldGet2(_bits2, this);
  	}
  	get level() {
  		return _classPrivateFieldGet2(_level, this);
  	}
  	get name() {
  		return _classPrivateFieldGet2(_name, this);
  	}
  }, _defineProperty(_ECLevel, "L", new _ECLevel("L", 0, 1)), _defineProperty(_ECLevel, "M", new _ECLevel("M", 1, 0)), _defineProperty(_ECLevel, "Q", new _ECLevel("Q", 2, 3)), _defineProperty(_ECLevel, "H", new _ECLevel("H", 3, 2)), _ECLevel);
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module ECB
  */
  var ECB = (_count = /* @__PURE__ */ new WeakMap(), _numDataCodewords = /* @__PURE__ */ new WeakMap(), class {
  	constructor(count, numDataCodewords) {
  		_classPrivateFieldInitSpec(this, _count, void 0);
  		_classPrivateFieldInitSpec(this, _numDataCodewords, void 0);
  		_classPrivateFieldSet2(_count, this, count);
  		_classPrivateFieldSet2(_numDataCodewords, this, numDataCodewords);
  	}
  	get count() {
  		return _classPrivateFieldGet2(_count, this);
  	}
  	get numDataCodewords() {
  		return _classPrivateFieldGet2(_numDataCodewords, this);
  	}
  });
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module ECBlocks
  */
  var ECBlocks = (_ecBlocks = /* @__PURE__ */ new WeakMap(), _numTotalCodewords = /* @__PURE__ */ new WeakMap(), _numTotalECCodewords = /* @__PURE__ */ new WeakMap(), _numTotalDataCodewords = /* @__PURE__ */ new WeakMap(), _numECCodewordsPerBlock = /* @__PURE__ */ new WeakMap(), class {
  	constructor(numECCodewordsPerBlock, ...ecBlocks) {
  		_classPrivateFieldInitSpec(this, _ecBlocks, void 0);
  		_classPrivateFieldInitSpec(this, _numTotalCodewords, void 0);
  		_classPrivateFieldInitSpec(this, _numTotalECCodewords, void 0);
  		_classPrivateFieldInitSpec(this, _numTotalDataCodewords, void 0);
  		_classPrivateFieldInitSpec(this, _numECCodewordsPerBlock, void 0);
  		let numBlocks = 0;
  		let numTotalDataCodewords = 0;
  		for (const { count, numDataCodewords } of ecBlocks) {
  			numBlocks += count;
  			numTotalDataCodewords += numDataCodewords * count;
  		}
  		const numTotalECCodewords = numECCodewordsPerBlock * numBlocks;
  		_classPrivateFieldSet2(_ecBlocks, this, ecBlocks);
  		_classPrivateFieldSet2(_numTotalECCodewords, this, numTotalECCodewords);
  		_classPrivateFieldSet2(_numTotalDataCodewords, this, numTotalDataCodewords);
  		_classPrivateFieldSet2(_numECCodewordsPerBlock, this, numECCodewordsPerBlock);
  		_classPrivateFieldSet2(_numTotalCodewords, this, numTotalDataCodewords + numTotalECCodewords);
  	}
  	get ecBlocks() {
  		return _classPrivateFieldGet2(_ecBlocks, this);
  	}
  	get numTotalCodewords() {
  		return _classPrivateFieldGet2(_numTotalCodewords, this);
  	}
  	get numTotalECCodewords() {
  		return _classPrivateFieldGet2(_numTotalECCodewords, this);
  	}
  	get numTotalDataCodewords() {
  		return _classPrivateFieldGet2(_numTotalDataCodewords, this);
  	}
  	get numECCodewordsPerBlock() {
  		return _classPrivateFieldGet2(_numECCodewordsPerBlock, this);
  	}
  });
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  var Version = (_size = /* @__PURE__ */ new WeakMap(), _version = /* @__PURE__ */ new WeakMap(), _ecBlocks2 = /* @__PURE__ */ new WeakMap(), _alignmentPatterns = /* @__PURE__ */ new WeakMap(), class {
  	constructor(version, alignmentPatterns, ...ecBlocks) {
  		_classPrivateFieldInitSpec(this, _size, void 0);
  		_classPrivateFieldInitSpec(this, _version, void 0);
  		_classPrivateFieldInitSpec(this, _ecBlocks2, void 0);
  		_classPrivateFieldInitSpec(this, _alignmentPatterns, void 0);
  		_classPrivateFieldSet2(_version, this, version);
  		_classPrivateFieldSet2(_ecBlocks2, this, ecBlocks);
  		_classPrivateFieldSet2(_size, this, 17 + 4 * version);
  		_classPrivateFieldSet2(_alignmentPatterns, this, alignmentPatterns);
  	}
  	get size() {
  		return _classPrivateFieldGet2(_size, this);
  	}
  	get version() {
  		return _classPrivateFieldGet2(_version, this);
  	}
  	get alignmentPatterns() {
  		return _classPrivateFieldGet2(_alignmentPatterns, this);
  	}
  	getECBlocks({ level }) {
  		return _classPrivateFieldGet2(_ecBlocks2, this)[level];
  	}
  });
  var VERSIONS = [
  	new Version(1, [], new ECBlocks(7, new ECB(1, 19)), new ECBlocks(10, new ECB(1, 16)), new ECBlocks(13, new ECB(1, 13)), new ECBlocks(17, new ECB(1, 9))),
  	new Version(2, [6, 18], new ECBlocks(10, new ECB(1, 34)), new ECBlocks(16, new ECB(1, 28)), new ECBlocks(22, new ECB(1, 22)), new ECBlocks(28, new ECB(1, 16))),
  	new Version(3, [6, 22], new ECBlocks(15, new ECB(1, 55)), new ECBlocks(26, new ECB(1, 44)), new ECBlocks(18, new ECB(2, 17)), new ECBlocks(22, new ECB(2, 13))),
  	new Version(4, [6, 26], new ECBlocks(20, new ECB(1, 80)), new ECBlocks(18, new ECB(2, 32)), new ECBlocks(26, new ECB(2, 24)), new ECBlocks(16, new ECB(4, 9))),
  	new Version(5, [6, 30], new ECBlocks(26, new ECB(1, 108)), new ECBlocks(24, new ECB(2, 43)), new ECBlocks(18, new ECB(2, 15), new ECB(2, 16)), new ECBlocks(22, new ECB(2, 11), new ECB(2, 12))),
  	new Version(6, [6, 34], new ECBlocks(18, new ECB(2, 68)), new ECBlocks(16, new ECB(4, 27)), new ECBlocks(24, new ECB(4, 19)), new ECBlocks(28, new ECB(4, 15))),
  	new Version(7, [
  		6,
  		22,
  		38
  	], new ECBlocks(20, new ECB(2, 78)), new ECBlocks(18, new ECB(4, 31)), new ECBlocks(18, new ECB(2, 14), new ECB(4, 15)), new ECBlocks(26, new ECB(4, 13), new ECB(1, 14))),
  	new Version(8, [
  		6,
  		24,
  		42
  	], new ECBlocks(24, new ECB(2, 97)), new ECBlocks(22, new ECB(2, 38), new ECB(2, 39)), new ECBlocks(22, new ECB(4, 18), new ECB(2, 19)), new ECBlocks(26, new ECB(4, 14), new ECB(2, 15))),
  	new Version(9, [
  		6,
  		26,
  		46
  	], new ECBlocks(30, new ECB(2, 116)), new ECBlocks(22, new ECB(3, 36), new ECB(2, 37)), new ECBlocks(20, new ECB(4, 16), new ECB(4, 17)), new ECBlocks(24, new ECB(4, 12), new ECB(4, 13))),
  	new Version(10, [
  		6,
  		28,
  		50
  	], new ECBlocks(18, new ECB(2, 68), new ECB(2, 69)), new ECBlocks(26, new ECB(4, 43), new ECB(1, 44)), new ECBlocks(24, new ECB(6, 19), new ECB(2, 20)), new ECBlocks(28, new ECB(6, 15), new ECB(2, 16))),
  	new Version(11, [
  		6,
  		30,
  		54
  	], new ECBlocks(20, new ECB(4, 81)), new ECBlocks(30, new ECB(1, 50), new ECB(4, 51)), new ECBlocks(28, new ECB(4, 22), new ECB(4, 23)), new ECBlocks(24, new ECB(3, 12), new ECB(8, 13))),
  	new Version(12, [
  		6,
  		32,
  		58
  	], new ECBlocks(24, new ECB(2, 92), new ECB(2, 93)), new ECBlocks(22, new ECB(6, 36), new ECB(2, 37)), new ECBlocks(26, new ECB(4, 20), new ECB(6, 21)), new ECBlocks(28, new ECB(7, 14), new ECB(4, 15))),
  	new Version(13, [
  		6,
  		34,
  		62
  	], new ECBlocks(26, new ECB(4, 107)), new ECBlocks(22, new ECB(8, 37), new ECB(1, 38)), new ECBlocks(24, new ECB(8, 20), new ECB(4, 21)), new ECBlocks(22, new ECB(12, 11), new ECB(4, 12))),
  	new Version(14, [
  		6,
  		26,
  		46,
  		66
  	], new ECBlocks(30, new ECB(3, 115), new ECB(1, 116)), new ECBlocks(24, new ECB(4, 40), new ECB(5, 41)), new ECBlocks(20, new ECB(11, 16), new ECB(5, 17)), new ECBlocks(24, new ECB(11, 12), new ECB(5, 13))),
  	new Version(15, [
  		6,
  		26,
  		48,
  		70
  	], new ECBlocks(22, new ECB(5, 87), new ECB(1, 88)), new ECBlocks(24, new ECB(5, 41), new ECB(5, 42)), new ECBlocks(30, new ECB(5, 24), new ECB(7, 25)), new ECBlocks(24, new ECB(11, 12), new ECB(7, 13))),
  	new Version(16, [
  		6,
  		26,
  		50,
  		74
  	], new ECBlocks(24, new ECB(5, 98), new ECB(1, 99)), new ECBlocks(28, new ECB(7, 45), new ECB(3, 46)), new ECBlocks(24, new ECB(15, 19), new ECB(2, 20)), new ECBlocks(30, new ECB(3, 15), new ECB(13, 16))),
  	new Version(17, [
  		6,
  		30,
  		54,
  		78
  	], new ECBlocks(28, new ECB(1, 107), new ECB(5, 108)), new ECBlocks(28, new ECB(10, 46), new ECB(1, 47)), new ECBlocks(28, new ECB(1, 22), new ECB(15, 23)), new ECBlocks(28, new ECB(2, 14), new ECB(17, 15))),
  	new Version(18, [
  		6,
  		30,
  		56,
  		82
  	], new ECBlocks(30, new ECB(5, 120), new ECB(1, 121)), new ECBlocks(26, new ECB(9, 43), new ECB(4, 44)), new ECBlocks(28, new ECB(17, 22), new ECB(1, 23)), new ECBlocks(28, new ECB(2, 14), new ECB(19, 15))),
  	new Version(19, [
  		6,
  		30,
  		58,
  		86
  	], new ECBlocks(28, new ECB(3, 113), new ECB(4, 114)), new ECBlocks(26, new ECB(3, 44), new ECB(11, 45)), new ECBlocks(26, new ECB(17, 21), new ECB(4, 22)), new ECBlocks(26, new ECB(9, 13), new ECB(16, 14))),
  	new Version(20, [
  		6,
  		34,
  		62,
  		90
  	], new ECBlocks(28, new ECB(3, 107), new ECB(5, 108)), new ECBlocks(26, new ECB(3, 41), new ECB(13, 42)), new ECBlocks(30, new ECB(15, 24), new ECB(5, 25)), new ECBlocks(28, new ECB(15, 15), new ECB(10, 16))),
  	new Version(21, [
  		6,
  		28,
  		50,
  		72,
  		94
  	], new ECBlocks(28, new ECB(4, 116), new ECB(4, 117)), new ECBlocks(26, new ECB(17, 42)), new ECBlocks(28, new ECB(17, 22), new ECB(6, 23)), new ECBlocks(30, new ECB(19, 16), new ECB(6, 17))),
  	new Version(22, [
  		6,
  		26,
  		50,
  		74,
  		98
  	], new ECBlocks(28, new ECB(2, 111), new ECB(7, 112)), new ECBlocks(28, new ECB(17, 46)), new ECBlocks(30, new ECB(7, 24), new ECB(16, 25)), new ECBlocks(24, new ECB(34, 13))),
  	new Version(23, [
  		6,
  		30,
  		54,
  		78,
  		102
  	], new ECBlocks(30, new ECB(4, 121), new ECB(5, 122)), new ECBlocks(28, new ECB(4, 47), new ECB(14, 48)), new ECBlocks(30, new ECB(11, 24), new ECB(14, 25)), new ECBlocks(30, new ECB(16, 15), new ECB(14, 16))),
  	new Version(24, [
  		6,
  		28,
  		54,
  		80,
  		106
  	], new ECBlocks(30, new ECB(6, 117), new ECB(4, 118)), new ECBlocks(28, new ECB(6, 45), new ECB(14, 46)), new ECBlocks(30, new ECB(11, 24), new ECB(16, 25)), new ECBlocks(30, new ECB(30, 16), new ECB(2, 17))),
  	new Version(25, [
  		6,
  		32,
  		58,
  		84,
  		110
  	], new ECBlocks(26, new ECB(8, 106), new ECB(4, 107)), new ECBlocks(28, new ECB(8, 47), new ECB(13, 48)), new ECBlocks(30, new ECB(7, 24), new ECB(22, 25)), new ECBlocks(30, new ECB(22, 15), new ECB(13, 16))),
  	new Version(26, [
  		6,
  		30,
  		58,
  		86,
  		114
  	], new ECBlocks(28, new ECB(10, 114), new ECB(2, 115)), new ECBlocks(28, new ECB(19, 46), new ECB(4, 47)), new ECBlocks(28, new ECB(28, 22), new ECB(6, 23)), new ECBlocks(30, new ECB(33, 16), new ECB(4, 17))),
  	new Version(27, [
  		6,
  		34,
  		62,
  		90,
  		118
  	], new ECBlocks(30, new ECB(8, 122), new ECB(4, 123)), new ECBlocks(28, new ECB(22, 45), new ECB(3, 46)), new ECBlocks(30, new ECB(8, 23), new ECB(26, 24)), new ECBlocks(30, new ECB(12, 15), new ECB(28, 16))),
  	new Version(28, [
  		6,
  		26,
  		50,
  		74,
  		98,
  		122
  	], new ECBlocks(30, new ECB(3, 117), new ECB(10, 118)), new ECBlocks(28, new ECB(3, 45), new ECB(23, 46)), new ECBlocks(30, new ECB(4, 24), new ECB(31, 25)), new ECBlocks(30, new ECB(11, 15), new ECB(31, 16))),
  	new Version(29, [
  		6,
  		30,
  		54,
  		78,
  		102,
  		126
  	], new ECBlocks(30, new ECB(7, 116), new ECB(7, 117)), new ECBlocks(28, new ECB(21, 45), new ECB(7, 46)), new ECBlocks(30, new ECB(1, 23), new ECB(37, 24)), new ECBlocks(30, new ECB(19, 15), new ECB(26, 16))),
  	new Version(30, [
  		6,
  		26,
  		52,
  		78,
  		104,
  		130
  	], new ECBlocks(30, new ECB(5, 115), new ECB(10, 116)), new ECBlocks(28, new ECB(19, 47), new ECB(10, 48)), new ECBlocks(30, new ECB(15, 24), new ECB(25, 25)), new ECBlocks(30, new ECB(23, 15), new ECB(25, 16))),
  	new Version(31, [
  		6,
  		30,
  		56,
  		82,
  		108,
  		134
  	], new ECBlocks(30, new ECB(13, 115), new ECB(3, 116)), new ECBlocks(28, new ECB(2, 46), new ECB(29, 47)), new ECBlocks(30, new ECB(42, 24), new ECB(1, 25)), new ECBlocks(30, new ECB(23, 15), new ECB(28, 16))),
  	new Version(32, [
  		6,
  		34,
  		60,
  		86,
  		112,
  		138
  	], new ECBlocks(30, new ECB(17, 115)), new ECBlocks(28, new ECB(10, 46), new ECB(23, 47)), new ECBlocks(30, new ECB(10, 24), new ECB(35, 25)), new ECBlocks(30, new ECB(19, 15), new ECB(35, 16))),
  	new Version(33, [
  		6,
  		30,
  		58,
  		86,
  		114,
  		142
  	], new ECBlocks(30, new ECB(17, 115), new ECB(1, 116)), new ECBlocks(28, new ECB(14, 46), new ECB(21, 47)), new ECBlocks(30, new ECB(29, 24), new ECB(19, 25)), new ECBlocks(30, new ECB(11, 15), new ECB(46, 16))),
  	new Version(34, [
  		6,
  		34,
  		62,
  		90,
  		118,
  		146
  	], new ECBlocks(30, new ECB(13, 115), new ECB(6, 116)), new ECBlocks(28, new ECB(14, 46), new ECB(23, 47)), new ECBlocks(30, new ECB(44, 24), new ECB(7, 25)), new ECBlocks(30, new ECB(59, 16), new ECB(1, 17))),
  	new Version(35, [
  		6,
  		30,
  		54,
  		78,
  		102,
  		126,
  		150
  	], new ECBlocks(30, new ECB(12, 121), new ECB(7, 122)), new ECBlocks(28, new ECB(12, 47), new ECB(26, 48)), new ECBlocks(30, new ECB(39, 24), new ECB(14, 25)), new ECBlocks(30, new ECB(22, 15), new ECB(41, 16))),
  	new Version(36, [
  		6,
  		24,
  		50,
  		76,
  		102,
  		128,
  		154
  	], new ECBlocks(30, new ECB(6, 121), new ECB(14, 122)), new ECBlocks(28, new ECB(6, 47), new ECB(34, 48)), new ECBlocks(30, new ECB(46, 24), new ECB(10, 25)), new ECBlocks(30, new ECB(2, 15), new ECB(64, 16))),
  	new Version(37, [
  		6,
  		28,
  		54,
  		80,
  		106,
  		132,
  		158
  	], new ECBlocks(30, new ECB(17, 122), new ECB(4, 123)), new ECBlocks(28, new ECB(29, 46), new ECB(14, 47)), new ECBlocks(30, new ECB(49, 24), new ECB(10, 25)), new ECBlocks(30, new ECB(24, 15), new ECB(46, 16))),
  	new Version(38, [
  		6,
  		32,
  		58,
  		84,
  		110,
  		136,
  		162
  	], new ECBlocks(30, new ECB(4, 122), new ECB(18, 123)), new ECBlocks(28, new ECB(13, 46), new ECB(32, 47)), new ECBlocks(30, new ECB(48, 24), new ECB(14, 25)), new ECBlocks(30, new ECB(42, 15), new ECB(32, 16))),
  	new Version(39, [
  		6,
  		26,
  		54,
  		82,
  		110,
  		138,
  		166
  	], new ECBlocks(30, new ECB(20, 117), new ECB(4, 118)), new ECBlocks(28, new ECB(40, 47), new ECB(7, 48)), new ECBlocks(30, new ECB(43, 24), new ECB(22, 25)), new ECBlocks(30, new ECB(10, 15), new ECB(67, 16))),
  	new Version(40, [
  		6,
  		30,
  		58,
  		86,
  		114,
  		142,
  		170
  	], new ECBlocks(30, new ECB(19, 118), new ECB(6, 119)), new ECBlocks(28, new ECB(18, 47), new ECB(31, 48)), new ECBlocks(30, new ECB(34, 24), new ECB(34, 25)), new ECBlocks(30, new ECB(20, 15), new ECB(61, 16)))
  ];
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module Polynomial
  */
  var Polynomial = (_field = /* @__PURE__ */ new WeakMap(), _coefficients = /* @__PURE__ */ new WeakMap(), class Polynomial {
  	constructor(field, coefficients) {
  		_classPrivateFieldInitSpec(this, _field, void 0);
  		_classPrivateFieldInitSpec(this, _coefficients, void 0);
  		const { length } = coefficients;
  		if (length <= 0) throw new Error("polynomial coefficients cannot empty");
  		_classPrivateFieldSet2(_field, this, field);
  		if (length > 1 && coefficients[0] === 0) {
  			let firstNonZero = 1;
  			while (firstNonZero < length && coefficients[firstNonZero] === 0) firstNonZero++;
  			if (firstNonZero === length) _classPrivateFieldSet2(_coefficients, this, new Int32Array([0]));
  			else {
  				const array = new Int32Array(length - firstNonZero);
  				array.set(coefficients.subarray(firstNonZero));
  				_classPrivateFieldSet2(_coefficients, this, array);
  			}
  		} else _classPrivateFieldSet2(_coefficients, this, coefficients);
  	}
  	get coefficients() {
  		return _classPrivateFieldGet2(_coefficients, this);
  	}
  	isZero() {
  		return _classPrivateFieldGet2(_coefficients, this)[0] === 0;
  	}
  	getDegree() {
  		return _classPrivateFieldGet2(_coefficients, this).length - 1;
  	}
  	getCoefficient(degree) {
  		const coefficients = _classPrivateFieldGet2(_coefficients, this);
  		return coefficients[coefficients.length - 1 - degree];
  	}
  	evaluate(a) {
  		if (a === 0) return this.getCoefficient(0);
  		let result;
  		const coefficients = _classPrivateFieldGet2(_coefficients, this);
  		if (a === 1) {
  			result = 0;
  			for (const coefficient of coefficients) result ^= coefficient;
  			return result;
  		}
  		[result] = coefficients;
  		const field = _classPrivateFieldGet2(_field, this);
  		const { length } = coefficients;
  		for (let i = 1; i < length; i++) result = field.multiply(a, result) ^ coefficients[i];
  		return result;
  	}
  	multiply(other) {
  		const field = _classPrivateFieldGet2(_field, this);
  		const coefficients = _classPrivateFieldGet2(_coefficients, this);
  		const { length } = coefficients;
  		if (other instanceof Polynomial) {
  			if (this.isZero() || other.isZero()) return field.zero;
  			const otherCoefficients = _classPrivateFieldGet2(_coefficients, other);
  			const otherLength = otherCoefficients.length;
  			const product = new Int32Array(length + otherLength - 1);
  			for (let i = 0; i < length; i++) {
  				const coefficient = coefficients[i];
  				for (let j = 0; j < otherLength; j++) product[i + j] ^= field.multiply(coefficient, otherCoefficients[j]);
  			}
  			return new Polynomial(field, product);
  		}
  		if (other === 0) return field.zero;
  		if (other === 1) return this;
  		const product = new Int32Array(length);
  		for (let i = 0; i < length; i++) product[i] = field.multiply(coefficients[i], other);
  		return new Polynomial(field, product);
  	}
  	multiplyByMonomial(degree, coefficient) {
  		const field = _classPrivateFieldGet2(_field, this);
  		if (coefficient === 0) return field.zero;
  		const coefficients = _classPrivateFieldGet2(_coefficients, this);
  		const { length } = coefficients;
  		const product = new Int32Array(length + degree);
  		for (let i = 0; i < length; i++) product[i] = field.multiply(coefficients[i], coefficient);
  		return new Polynomial(field, product);
  	}
  	addOrSubtract(other) {
  		if (this.isZero()) return other;
  		if (other.isZero()) return this;
  		let largerCoefficients = _classPrivateFieldGet2(_coefficients, other);
  		let largerLength = largerCoefficients.length;
  		let smallerCoefficients = _classPrivateFieldGet2(_coefficients, this);
  		let smallerLength = smallerCoefficients.length;
  		if (largerLength < smallerLength) {
  			[largerLength, smallerLength] = [smallerLength, largerLength];
  			[largerCoefficients, smallerCoefficients] = [smallerCoefficients, largerCoefficients];
  		}
  		const offset = largerLength - smallerLength;
  		const coefficients = new Int32Array(largerLength);
  		coefficients.set(largerCoefficients.subarray(0, offset));
  		for (let i = offset; i < largerLength; i++) coefficients[i] = smallerCoefficients[i - offset] ^ largerCoefficients[i];
  		return new Polynomial(_classPrivateFieldGet2(_field, this), coefficients);
  	}
  	divide(other) {
  		const field = _classPrivateFieldGet2(_field, this);
  		let quotient = field.zero;
  		let remainder = this;
  		const denominatorLeadingTerm = other.getCoefficient(other.getDegree());
  		const invertDenominatorLeadingTerm = field.invert(denominatorLeadingTerm);
  		while (remainder.getDegree() >= other.getDegree() && !remainder.isZero()) {
  			const remainderDegree = remainder.getDegree();
  			const degreeDiff = remainderDegree - other.getDegree();
  			const scale = field.multiply(remainder.getCoefficient(remainderDegree), invertDenominatorLeadingTerm);
  			const term = other.multiplyByMonomial(degreeDiff, scale);
  			const iterationQuotient = field.buildPolynomial(degreeDiff, scale);
  			quotient = quotient.addOrSubtract(iterationQuotient);
  			remainder = remainder.addOrSubtract(term);
  		}
  		return [quotient, remainder];
  	}
  });
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  var QR_CODE_FIELD_256 = new (_size2 = /* @__PURE__ */ new WeakMap(), _one = /* @__PURE__ */ new WeakMap(), _zero = /* @__PURE__ */ new WeakMap(), _generator = /* @__PURE__ */ new WeakMap(), _expTable = /* @__PURE__ */ new WeakMap(), _logTable = /* @__PURE__ */ new WeakMap(), class {
  	constructor(primitive, size, generator) {
  		_classPrivateFieldInitSpec(this, _size2, void 0);
  		_classPrivateFieldInitSpec(this, _one, void 0);
  		_classPrivateFieldInitSpec(this, _zero, void 0);
  		_classPrivateFieldInitSpec(this, _generator, void 0);
  		_classPrivateFieldInitSpec(this, _expTable, void 0);
  		_classPrivateFieldInitSpec(this, _logTable, void 0);
  		let x = 1;
  		const expTable = new Int32Array(size);
  		for (let i = 0; i < size; i++) {
  			expTable[i] = x;
  			x *= 2;
  			if (x >= size) {
  				x ^= primitive;
  				x &= size - 1;
  			}
  		}
  		const logTable = new Int32Array(size);
  		for (let i = 0, length = size - 1; i < length; i++) logTable[expTable[i]] = i;
  		_classPrivateFieldSet2(_size2, this, size);
  		_classPrivateFieldSet2(_expTable, this, expTable);
  		_classPrivateFieldSet2(_logTable, this, logTable);
  		_classPrivateFieldSet2(_generator, this, generator);
  		_classPrivateFieldSet2(_one, this, new Polynomial(this, new Int32Array([1])));
  		_classPrivateFieldSet2(_zero, this, new Polynomial(this, new Int32Array([0])));
  	}
  	get size() {
  		return _classPrivateFieldGet2(_size2, this);
  	}
  	get one() {
  		return _classPrivateFieldGet2(_one, this);
  	}
  	get zero() {
  		return _classPrivateFieldGet2(_zero, this);
  	}
  	get generator() {
  		return _classPrivateFieldGet2(_generator, this);
  	}
  	exp(a) {
  		return _classPrivateFieldGet2(_expTable, this)[a];
  	}
  	log(a) {
  		return _classPrivateFieldGet2(_logTable, this)[a];
  	}
  	invert(a) {
  		return _classPrivateFieldGet2(_expTable, this)[_classPrivateFieldGet2(_size2, this) - _classPrivateFieldGet2(_logTable, this)[a] - 1];
  	}
  	multiply(a, b) {
  		if (a === 0 || b === 0) return 0;
  		const logTable = _classPrivateFieldGet2(_logTable, this);
  		return _classPrivateFieldGet2(_expTable, this)[(logTable[a] + logTable[b]) % (_classPrivateFieldGet2(_size2, this) - 1)];
  	}
  	buildPolynomial(degree, coefficient) {
  		if (coefficient === 0) return _classPrivateFieldGet2(_zero, this);
  		const coefficients = new Int32Array(degree + 1);
  		coefficients[0] = coefficient;
  		return new Polynomial(this, coefficients);
  	}
  })(285, 256, 0);
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module index
  */
  function getUnicodeCodes(content, maxCode) {
  	const bytes = [];
  	for (const character of content) {
  		const code = character.codePointAt(0);
  		bytes.push(code == null || code > maxCode ? 63 : code);
  	}
  	return new Uint8Array(bytes);
  }
  function encode$1(content, charset) {
  	switch (charset) {
  		case Charset.ASCII: return getUnicodeCodes(content, 127);
  		case Charset.ISO_8859_1: return getUnicodeCodes(content, 255);
  		case Charset.UTF_8: return new TextEncoder().encode(content);
  		default: throw new Error(`built-in encode not support charset: ${charset.label}`);
  	}
  }
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module BitArray
  */
  var LOAD_FACTOR = .75;
  function offset(index) {
  	return index >>> 5;
  }
  function makeArray(length) {
  	return new Int32Array(length + 31 >>> 5);
  }
  var BitArray = (_length = /* @__PURE__ */ new WeakMap(), _bits3 = /* @__PURE__ */ new WeakMap(), _BitArray_brand = /* @__PURE__ */ new WeakSet(), class BitArray {
  	constructor(length = 0) {
  		_classPrivateMethodInitSpec(this, _BitArray_brand);
  		_classPrivateFieldInitSpec(this, _length, void 0);
  		_classPrivateFieldInitSpec(this, _bits3, void 0);
  		_classPrivateFieldSet2(_length, this, length);
  		_classPrivateFieldSet2(_bits3, this, makeArray(length));
  	}
  	get length() {
  		return _classPrivateFieldGet2(_length, this);
  	}
  	get byteLength() {
  		return _classPrivateFieldGet2(_length, this) + 7 >>> 3;
  	}
  	set(index) {
  		_classPrivateFieldGet2(_bits3, this)[offset(index)] |= getBitMask(index);
  	}
  	get(index) {
  		return toBit(_classPrivateFieldGet2(_bits3, this)[offset(index)] >>> getBitOffset(index));
  	}
  	xor(mask) {
  		const bits = _classPrivateFieldGet2(_bits3, this);
  		const maskBits = _classPrivateFieldGet2(_bits3, mask);
  		const length = Math.min(_classPrivateFieldGet2(_length, this), _classPrivateFieldGet2(_length, mask));
  		for (let i = 0; i < length; i++) bits[i] ^= maskBits[i];
  	}
  	append(value, length = 1) {
  		let index = _classPrivateFieldGet2(_length, this);
  		if (value instanceof BitArray) {
  			length = _classPrivateFieldGet2(_length, value);
  			_assertClassBrand(_BitArray_brand, this, _alloc).call(this, index + length);
  			for (let i = 0; i < length; i++) {
  				if (value.get(i) !== 0) this.set(index);
  				index++;
  			}
  		} else {
  			_assertClassBrand(_BitArray_brand, this, _alloc).call(this, index + length);
  			for (let i = length - 1; i >= 0; i--) {
  				if (toBit(value >>> i) !== 0) this.set(index);
  				index++;
  			}
  		}
  	}
  	copyTo(bitOffset, target, byteOffset, byteLength) {
  		for (let i = 0; i < byteLength; i++) {
  			let byte = 0;
  			for (let j = 0; j < 8; j++) if (this.get(bitOffset++) !== 0) byte |= 1 << 7 - j;
  			target[byteOffset + i] = byte;
  		}
  	}
  	clear() {
  		_classPrivateFieldGet2(_bits3, this).fill(0);
  	}
  });
  function _alloc(length) {
  	const bits = _classPrivateFieldGet2(_bits3, this);
  	if (length > bits.length * 32) {
  		const array = makeArray(Math.ceil(length / LOAD_FACTOR));
  		array.set(bits);
  		_classPrivateFieldSet2(_bits3, this, array);
  	}
  	_classPrivateFieldSet2(_length, this, length);
  }
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module ByteMatrix
  */
  var ByteMatrix = (_size3 = /* @__PURE__ */ new WeakMap(), _bytes = /* @__PURE__ */ new WeakMap(), class {
  	constructor(size) {
  		_classPrivateFieldInitSpec(this, _size3, void 0);
  		_classPrivateFieldInitSpec(this, _bytes, void 0);
  		_classPrivateFieldSet2(_size3, this, size);
  		_classPrivateFieldSet2(_bytes, this, new Int8Array(size * size));
  	}
  	get size() {
  		return _classPrivateFieldGet2(_size3, this);
  	}
  	set(x, y, value) {
  		_classPrivateFieldGet2(_bytes, this)[y * _classPrivateFieldGet2(_size3, this) + x] = value;
  	}
  	get(x, y) {
  		return _classPrivateFieldGet2(_bytes, this)[y * _classPrivateFieldGet2(_size3, this) + x];
  	}
  	clear(value) {
  		_classPrivateFieldGet2(_bytes, this).fill(value);
  	}
  });
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module matrix
  */
  var FORMAT_INFO_POLY = 1335;
  var FORMAT_INFO_MASK = 21522;
  var VERSION_INFO_POLY = 7973;
  var FINDER_PATTERN_SHAPE = [
  	[
  		1,
  		1,
  		1,
  		1,
  		1,
  		1,
  		1
  	],
  	[
  		1,
  		0,
  		0,
  		0,
  		0,
  		0,
  		1
  	],
  	[
  		1,
  		0,
  		1,
  		1,
  		1,
  		0,
  		1
  	],
  	[
  		1,
  		0,
  		1,
  		1,
  		1,
  		0,
  		1
  	],
  	[
  		1,
  		0,
  		1,
  		1,
  		1,
  		0,
  		1
  	],
  	[
  		1,
  		0,
  		0,
  		0,
  		0,
  		0,
  		1
  	],
  	[
  		1,
  		1,
  		1,
  		1,
  		1,
  		1,
  		1
  	]
  ];
  var ALIGNMENT_PATTERN_SHAPE = [
  	[
  		1,
  		1,
  		1,
  		1,
  		1
  	],
  	[
  		1,
  		0,
  		0,
  		0,
  		1
  	],
  	[
  		1,
  		0,
  		1,
  		0,
  		1
  	],
  	[
  		1,
  		0,
  		0,
  		0,
  		1
  	],
  	[
  		1,
  		1,
  		1,
  		1,
  		1
  	]
  ];
  var FORMAT_INFO_COORDINATES = [
  	[8, 0],
  	[8, 1],
  	[8, 2],
  	[8, 3],
  	[8, 4],
  	[8, 5],
  	[8, 7],
  	[8, 8],
  	[7, 8],
  	[5, 8],
  	[4, 8],
  	[3, 8],
  	[2, 8],
  	[1, 8],
  	[0, 8]
  ];
  function isEmpty(matrix, x, y) {
  	return matrix.get(x, y) === -1;
  }
  function embedFinderPattern(matrix, x, y) {
  	for (let i = 0; i < 7; i++) {
  		const pattern = FINDER_PATTERN_SHAPE[i];
  		for (let j = 0; j < 7; j++) matrix.set(x + j, y + i, pattern[j]);
  	}
  }
  function embedHorizontalSeparator(matrix, x, y) {
  	for (let j = 0; j < 8; j++) matrix.set(x + j, y, 0);
  }
  function embedVerticalSeparator(matrix, x, y) {
  	for (let i = 0; i < 7; i++) matrix.set(x, y + i, 0);
  }
  function embedFinderPatternsAndSeparators(matrix) {
  	const pdpWidth = 7;
  	const hspWidth = 8;
  	const vspHeight = 7;
  	const { size } = matrix;
  	embedFinderPattern(matrix, 0, 0);
  	embedFinderPattern(matrix, size - pdpWidth, 0);
  	embedFinderPattern(matrix, 0, size - pdpWidth);
  	embedHorizontalSeparator(matrix, 0, 7);
  	embedHorizontalSeparator(matrix, size - hspWidth, 7);
  	embedHorizontalSeparator(matrix, 0, size - hspWidth);
  	embedVerticalSeparator(matrix, vspHeight, 0);
  	embedVerticalSeparator(matrix, size - vspHeight - 1, 0);
  	embedVerticalSeparator(matrix, vspHeight, size - vspHeight);
  }
  function embedTimingPatterns(matrix) {
  	const size = matrix.size - 8;
  	for (let x = 8; x < size; x++) {
  		const bit = x + 1 & 1;
  		if (isEmpty(matrix, x, 6)) matrix.set(x, 6, bit);
  	}
  	for (let y = 8; y < size; y++) {
  		const bit = y + 1 & 1;
  		if (isEmpty(matrix, 6, y)) matrix.set(6, y, bit);
  	}
  }
  function embedAlignmentPattern(matrix, x, y) {
  	for (let i = 0; i < 5; i++) {
  		const pattern = ALIGNMENT_PATTERN_SHAPE[i];
  		for (let j = 0; j < 5; j++) matrix.set(x + j, y + i, pattern[j]);
  	}
  }
  function embedAlignmentPatterns(matrix, { version }) {
  	if (version >= 2) {
  		const { alignmentPatterns } = VERSIONS[version - 1];
  		const { length } = alignmentPatterns;
  		for (let i = 0; i < length; i++) {
  			const y = alignmentPatterns[i];
  			for (let j = 0; j < length; j++) {
  				const x = alignmentPatterns[j];
  				if (isEmpty(matrix, x, y)) embedAlignmentPattern(matrix, x - 2, y - 2);
  			}
  		}
  	}
  }
  function embedDarkModule(matrix) {
  	matrix.set(8, matrix.size - 8, 1);
  }
  function makeFormatInfoBits(bits, ecLevel, mask) {
  	const formatInfo = ecLevel.bits << 3 | mask;
  	bits.append(formatInfo, 5);
  	const bchCode = calculateBCHCode(formatInfo, FORMAT_INFO_POLY);
  	bits.append(bchCode, 10);
  	const maskBits = new BitArray();
  	maskBits.append(FORMAT_INFO_MASK, 15);
  	bits.xor(maskBits);
  }
  function embedFormatInfo(matrix, ecLevel, mask) {
  	const formatInfoBits = new BitArray();
  	makeFormatInfoBits(formatInfoBits, ecLevel, mask);
  	const { size } = matrix;
  	const { length } = formatInfoBits;
  	for (let i = 0; i < length; i++) {
  		const [x, y] = FORMAT_INFO_COORDINATES[i];
  		const bit = formatInfoBits.get(length - 1 - i);
  		matrix.set(x, y, bit);
  		if (i < 8) matrix.set(size - i - 1, 8, bit);
  		else matrix.set(8, size - 7 + (i - 8), bit);
  	}
  	embedDarkModule(matrix);
  }
  function makeVersionInfoBits(bits, version) {
  	bits.append(version, 6);
  	const bchCode = calculateBCHCode(version, VERSION_INFO_POLY);
  	bits.append(bchCode, 12);
  }
  function embedVersionInfo(matrix, { version }) {
  	if (version >= 7) {
  		const versionInfoBits = new BitArray();
  		makeVersionInfoBits(versionInfoBits, version);
  		let bitIndex = 17;
  		const { size } = matrix;
  		for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
  			const bit = versionInfoBits.get(bitIndex--);
  			matrix.set(i, size - 11 + j, bit);
  			matrix.set(size - 11 + j, i, bit);
  		}
  	}
  }
  function embedCodewords(matrix, codewords, mask) {
  	let bitIndex = 0;
  	const { size } = matrix;
  	const { length } = codewords;
  	for (let x = size - 1; x >= 1; x -= 2) {
  		if (x === 6) x = 5;
  		for (let y = 0; y < size; y++) for (let i = 0; i < 2; i++) {
  			const offsetX = x - i;
  			const offsetY = (x + 1 & 2) === 0 ? size - 1 - y : y;
  			if (isEmpty(matrix, offsetX, offsetY)) {
  				let bit = 0;
  				if (bitIndex < length) bit = codewords.get(bitIndex++);
  				if (isApplyMask(mask, offsetX, offsetY)) bit ^= 1;
  				matrix.set(offsetX, offsetY, bit);
  			}
  		}
  	}
  }
  function embedFunctionPatterns(matrix, version) {
  	embedFinderPatternsAndSeparators(matrix);
  	embedAlignmentPatterns(matrix, version);
  	embedTimingPatterns(matrix);
  }
  function embedEncodingRegion(matrix, codewords, version, ecLevel, mask) {
  	embedFormatInfo(matrix, ecLevel, mask);
  	embedVersionInfo(matrix, version);
  	embedCodewords(matrix, codewords, mask);
  }
  function buildMatrix(codewords, version, ecLevel, mask) {
  	const matrix = new ByteMatrix(version.size);
  	matrix.clear(-1);
  	embedFunctionPatterns(matrix, version);
  	embedEncodingRegion(matrix, codewords, version, ecLevel, mask);
  	return matrix;
  }
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module BlockPair
  */
  var BlockPair = (_ecCodewords = /* @__PURE__ */ new WeakMap(), _dataCodewords = /* @__PURE__ */ new WeakMap(), class {
  	constructor(dataCodewords, ecCodewords) {
  		_classPrivateFieldInitSpec(this, _ecCodewords, void 0);
  		_classPrivateFieldInitSpec(this, _dataCodewords, void 0);
  		_classPrivateFieldSet2(_ecCodewords, this, ecCodewords);
  		_classPrivateFieldSet2(_dataCodewords, this, dataCodewords);
  	}
  	get ecCodewords() {
  		return _classPrivateFieldGet2(_ecCodewords, this);
  	}
  	get dataCodewords() {
  		return _classPrivateFieldGet2(_dataCodewords, this);
  	}
  });
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module Encoder
  */
  function buildGenerator(field, generators, degree) {
  	const { length } = generators;
  	if (degree >= length) {
  		const { generator } = field;
  		let lastGenerator = generators[length - 1];
  		for (let i = length; i <= degree; i++) {
  			const coefficients = new Int32Array([1, field.exp(i - 1 + generator)]);
  			const nextGenerator = lastGenerator.multiply(new Polynomial(field, coefficients));
  			generators.push(nextGenerator);
  			lastGenerator = nextGenerator;
  		}
  	}
  	return generators[degree];
  }
  var Encoder$1 = (_field2 = /* @__PURE__ */ new WeakMap(), _generators = /* @__PURE__ */ new WeakMap(), class {
  	constructor(field = QR_CODE_FIELD_256) {
  		_classPrivateFieldInitSpec(this, _field2, void 0);
  		_classPrivateFieldInitSpec(this, _generators, void 0);
  		_classPrivateFieldSet2(_field2, this, field);
  		_classPrivateFieldSet2(_generators, this, [new Polynomial(field, new Int32Array([1]))]);
  	}
  	encode(received, ecLength) {
  		const dataBytes = received.length - ecLength;
  		const infoCoefficients = new Int32Array(dataBytes);
  		const generator = buildGenerator(_classPrivateFieldGet2(_field2, this), _classPrivateFieldGet2(_generators, this), ecLength);
  		infoCoefficients.set(received.subarray(0, dataBytes));
  		const [, remainder] = new Polynomial(_classPrivateFieldGet2(_field2, this), infoCoefficients).multiplyByMonomial(ecLength, 1).divide(generator);
  		const { coefficients } = remainder;
  		const zeroCoefficientsOffset = dataBytes + (ecLength - coefficients.length);
  		received.fill(0, dataBytes, zeroCoefficientsOffset);
  		received.set(coefficients, zeroCoefficientsOffset);
  	}
  });
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module encoder
  */
  function generateECCodewords(codewords, numECCodewords) {
  	const numDataCodewords = codewords.length;
  	const buffer = new Int32Array(numDataCodewords + numECCodewords);
  	buffer.set(codewords);
  	new Encoder$1().encode(buffer, numECCodewords);
  	return new Uint8Array(buffer.subarray(numDataCodewords));
  }
  function injectECCodewords(bits, { ecBlocks, numECCodewordsPerBlock }) {
  	let maxNumECCodewords = 0;
  	let maxNumDataCodewords = 0;
  	let dataCodewordsOffset = 0;
  	const blocks = [];
  	for (const { count, numDataCodewords } of ecBlocks) for (let i = 0; i < count; i++) {
  		const dataCodewords = new Uint8Array(numDataCodewords);
  		bits.copyTo(dataCodewordsOffset * 8, dataCodewords, 0, numDataCodewords);
  		const ecCodewords = generateECCodewords(dataCodewords, numECCodewordsPerBlock);
  		blocks.push(new BlockPair(dataCodewords, ecCodewords));
  		dataCodewordsOffset += numDataCodewords;
  		maxNumECCodewords = Math.max(maxNumECCodewords, ecCodewords.length);
  		maxNumDataCodewords = Math.max(maxNumDataCodewords, numDataCodewords);
  	}
  	const codewords = new BitArray();
  	for (let i = 0; i < maxNumDataCodewords; i++) for (const { dataCodewords } of blocks) if (i < dataCodewords.length) codewords.append(dataCodewords[i], 8);
  	for (let i = 0; i < maxNumECCodewords; i++) for (const { ecCodewords } of blocks) if (i < ecCodewords.length) codewords.append(ecCodewords[i], 8);
  	return codewords;
  }
  function appendTerminator(bits, numDataCodewords) {
  	const capacity = numDataCodewords * 8;
  	for (let i = 0; i < 4 && bits.length < capacity; i++) bits.append(0);
  	const numBitsInLastByte = bits.length & 7;
  	if (numBitsInLastByte > 0) for (let i = numBitsInLastByte; i < 8; i++) bits.append(0);
  	const numPaddingCodewords = numDataCodewords - bits.byteLength;
  	for (let i = 0; i < numPaddingCodewords; i++) bits.append(i & 1 ? 17 : 236, 8);
  }
  function isByteMode(segment) {
  	return segment.mode === Mode.BYTE;
  }
  function isHanziMode(segment) {
  	return segment.mode === Mode.HANZI;
  }
  function appendModeInfo(bits, mode) {
  	bits.append(mode.bits, 4);
  }
  function appendECI(bits, segment, currentECIValue) {
  	if (isByteMode(segment)) {
  		const [value] = segment.charset.values;
  		if (value !== currentECIValue) {
  			bits.append(Mode.ECI.bits, 4);
  			if (value <= 127) bits.append(value, 8);
  			else if (value <= 16383) bits.append(32768 | value, 16);
  			else bits.append(12582912 | value, 24);
  			return value;
  		}
  	}
  	return currentECIValue;
  }
  function appendFNC1Info(bits, fnc1) {
  	const [mode, indicator] = fnc1;
  	switch (mode) {
  		case "GS1":
  			appendModeInfo(bits, Mode.FNC1_FIRST_POSITION);
  			break;
  		case "AIM":
  			appendModeInfo(bits, Mode.FNC1_SECOND_POSITION);
  			bits.append(indicator, 8);
  	}
  }
  function getSegmentLength(segment, bits) {
  	if (isByteMode(segment)) return bits.byteLength;
  	return segment.content.length;
  }
  function appendLengthInfo(bits, mode, version, numLetters) {
  	bits.append(numLetters, mode.getCharacterCountBits(version));
  }
  function willFit(numInputBits, version, ecLevel) {
  	const ecBlocks = version.getECBlocks(ecLevel);
  	const numInputCodewords = numInputBits + 7 >>> 3;
  	return ecBlocks.numTotalDataCodewords >= numInputCodewords;
  }
  function chooseVersion(numInputBits, ecLevel) {
  	for (const version of VERSIONS) if (willFit(numInputBits, version, ecLevel)) return version;
  	throw new Error("data too big for all versions");
  }
  function calculateBitsNeeded(segmentBlocks, version) {
  	let bitsNeeded = 0;
  	for (const { mode, head, body } of segmentBlocks) bitsNeeded += head.length + mode.getCharacterCountBits(version) + body.length;
  	return bitsNeeded;
  }
  function chooseRecommendVersion(segmentBlocks, ecLevel) {
  	return chooseVersion(calculateBitsNeeded(segmentBlocks, chooseVersion(calculateBitsNeeded(segmentBlocks, VERSIONS[0]), ecLevel)), ecLevel);
  }
  function chooseBestMaskAndMatrix(codewords, version, ecLevel) {
  	let bestMask = 0;
  	let bestMatrix = buildMatrix(codewords, version, ecLevel, bestMask);
  	let minPenalty = calculateMaskPenalty(bestMatrix);
  	for (let mask = 1; mask < 8; mask++) {
  		const matrix = buildMatrix(codewords, version, ecLevel, mask);
  		const penalty = calculateMaskPenalty(matrix);
  		if (penalty < minPenalty) {
  			bestMask = mask;
  			bestMatrix = matrix;
  			minPenalty = penalty;
  		}
  	}
  	return [bestMask, bestMatrix];
  }
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module Dict
  * @see https://github.com/google/dart-gif-encoder
  */
  var MAX_CODE = 4095;
  /**
  * A dict contains codes defined during LZW compression. It's a mapping from a string
  * of pixels to the code that represents it. The codes are stored in a trie which is
  * represented as a map. Codes may be up to 12 bits. The size of the codebook is always
  * the minimum power of 2 needed to represent all the codes and automatically increases
  * as new codes are defined.
  */
  var Dict = (_bof = /* @__PURE__ */ new WeakMap(), _eof = /* @__PURE__ */ new WeakMap(), _bits4 = /* @__PURE__ */ new WeakMap(), _depth = /* @__PURE__ */ new WeakMap(), _size4 = /* @__PURE__ */ new WeakMap(), _unused = /* @__PURE__ */ new WeakMap(), _codes = /* @__PURE__ */ new WeakMap(), class {
  	constructor(depth) {
  		_classPrivateFieldInitSpec(this, _bof, void 0);
  		_classPrivateFieldInitSpec(this, _eof, void 0);
  		_classPrivateFieldInitSpec(this, _bits4, void 0);
  		_classPrivateFieldInitSpec(this, _depth, void 0);
  		_classPrivateFieldInitSpec(this, _size4, void 0);
  		_classPrivateFieldInitSpec(this, _unused, void 0);
  		_classPrivateFieldInitSpec(this, _codes, void 0);
  		const bof = 1 << depth;
  		const eof = bof + 1;
  		_classPrivateFieldSet2(_bof, this, bof);
  		_classPrivateFieldSet2(_eof, this, eof);
  		_classPrivateFieldSet2(_depth, this, depth);
  		this.reset();
  	}
  	get bof() {
  		return _classPrivateFieldGet2(_bof, this);
  	}
  	get eof() {
  		return _classPrivateFieldGet2(_eof, this);
  	}
  	get bits() {
  		return _classPrivateFieldGet2(_bits4, this);
  	}
  	get depth() {
  		return _classPrivateFieldGet2(_depth, this);
  	}
  	reset() {
  		const bits = _classPrivateFieldGet2(_depth, this) + 1;
  		_classPrivateFieldSet2(_bits4, this, bits);
  		_classPrivateFieldSet2(_size4, this, 1 << bits);
  		_classPrivateFieldSet2(_codes, this, /* @__PURE__ */ new Map());
  		_classPrivateFieldSet2(_unused, this, _classPrivateFieldGet2(_eof, this) + 1);
  	}
  	add(code, index) {
  		let unused = _classPrivateFieldGet2(_unused, this);
  		if (unused > MAX_CODE) return false;
  		_classPrivateFieldGet2(_codes, this).set(code << 8 | index, unused++);
  		let bits = _classPrivateFieldGet2(_bits4, this);
  		let size = _classPrivateFieldGet2(_size4, this);
  		if (unused > size) size = 1 << ++bits;
  		_classPrivateFieldSet2(_bits4, this, bits);
  		_classPrivateFieldSet2(_size4, this, size);
  		_classPrivateFieldSet2(_unused, this, unused);
  		return true;
  	}
  	get(code, index) {
  		return _classPrivateFieldGet2(_codes, this).get(code << 8 | index);
  	}
  });
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module DictStream
  * @see https://github.com/google/dart-gif-encoder
  */
  var DictStream = (_bits5 = /* @__PURE__ */ new WeakMap(), _dict = /* @__PURE__ */ new WeakMap(), _buffer = /* @__PURE__ */ new WeakMap(), _bytes2 = /* @__PURE__ */ new WeakMap(), class {
  	constructor(dict) {
  		_classPrivateFieldInitSpec(this, _bits5, 0);
  		_classPrivateFieldInitSpec(this, _dict, void 0);
  		_classPrivateFieldInitSpec(this, _buffer, 0);
  		_classPrivateFieldInitSpec(this, _bytes2, []);
  		_classPrivateFieldSet2(_dict, this, dict);
  	}
  	write(code) {
  		let bits = _classPrivateFieldGet2(_bits5, this);
  		let buffer = _classPrivateFieldGet2(_buffer, this) | code << bits;
  		bits += _classPrivateFieldGet2(_dict, this).bits;
  		const bytes = _classPrivateFieldGet2(_bytes2, this);
  		while (bits >= 8) {
  			bytes.push(buffer & 255);
  			buffer >>= 8;
  			bits -= 8;
  		}
  		_classPrivateFieldSet2(_bits5, this, bits);
  		_classPrivateFieldSet2(_buffer, this, buffer);
  	}
  	pipe(stream) {
  		const bytes = _classPrivateFieldGet2(_bytes2, this);
  		if (_classPrivateFieldGet2(_bits5, this) > 0) bytes.push(_classPrivateFieldGet2(_buffer, this));
  		stream.writeByte(_classPrivateFieldGet2(_dict, this).depth);
  		const { length } = bytes;
  		for (let i = 0; i < length;) {
  			const remain = length - i;
  			if (remain >= 255) {
  				stream.writeByte(255);
  				stream.writeBytes(bytes, i, 255);
  				i += 255;
  			} else {
  				stream.writeByte(remain);
  				stream.writeBytes(bytes, i, remain);
  				i = length;
  			}
  		}
  		stream.writeByte(0);
  	}
  });
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module index
  * @see https://github.com/google/dart-gif-encoder
  */
  function compress(pixels, depth, stream) {
  	const dict = new Dict(depth);
  	const buffer = new DictStream(dict);
  	buffer.write(dict.bof);
  	if (pixels.length > 0) {
  		let code = pixels[0];
  		const { length } = pixels;
  		for (let i = 1; i < length; i++) {
  			const pixelIndex = pixels[i];
  			const nextCode = dict.get(code, pixelIndex);
  			if (nextCode != null) code = nextCode;
  			else {
  				buffer.write(code);
  				if (!dict.add(code, pixelIndex)) {
  					buffer.write(dict.bof);
  					dict.reset();
  				}
  				code = pixelIndex;
  			}
  		}
  		buffer.write(code);
  	}
  	buffer.write(dict.eof);
  	buffer.pipe(stream);
  }
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module ByteStream
  */
  var ByteStream = (_bytes3 = /* @__PURE__ */ new WeakMap(), class {
  	constructor() {
  		_classPrivateFieldInitSpec(this, _bytes3, []);
  	}
  	get bytes() {
  		return _classPrivateFieldGet2(_bytes3, this);
  	}
  	writeByte(value) {
  		_classPrivateFieldGet2(_bytes3, this).push(value & 255);
  	}
  	writeInt16(value) {
  		_classPrivateFieldGet2(_bytes3, this).push(value & 255, value >> 8 & 255);
  	}
  	writeBytes(bytes, offset = 0, length = bytes.length) {
  		const buffer = _classPrivateFieldGet2(_bytes3, this);
  		for (let i = 0; i < length; i++) buffer.push(bytes[offset + i] & 255);
  	}
  });
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module Base64Stream
  */
  var { fromCharCode } = String;
  function encode(byte) {
  	byte &= 63;
  	if (byte >= 0) {
  		if (byte < 26) return 65 + byte;
  		else if (byte < 52) return 97 + (byte - 26);
  		else if (byte < 62) return 48 + (byte - 52);
  		else if (byte === 62) return 43;
  		else if (byte === 63) return 47;
  	}
  	throw new Error(`illegal char: ${fromCharCode(byte)}`);
  }
  var Base64Stream = (_bits6 = /* @__PURE__ */ new WeakMap(), _buffer2 = /* @__PURE__ */ new WeakMap(), _length2 = /* @__PURE__ */ new WeakMap(), _stream = /* @__PURE__ */ new WeakMap(), class {
  	constructor() {
  		_classPrivateFieldInitSpec(this, _bits6, 0);
  		_classPrivateFieldInitSpec(this, _buffer2, 0);
  		_classPrivateFieldInitSpec(this, _length2, 0);
  		_classPrivateFieldInitSpec(this, _stream, new ByteStream());
  	}
  	get bytes() {
  		return _classPrivateFieldGet2(_stream, this).bytes;
  	}
  	write(byte) {
  		var _this$length;
  		let bits = _classPrivateFieldGet2(_bits6, this) + 8;
  		const stream = _classPrivateFieldGet2(_stream, this);
  		const buffer = _classPrivateFieldGet2(_buffer2, this) << 8 | byte & 255;
  		while (bits >= 6) {
  			stream.writeByte(encode(buffer >>> bits - 6));
  			bits -= 6;
  		}
  		_classPrivateFieldSet2(_length2, this, (_this$length = _classPrivateFieldGet2(_length2, this), _this$length++, _this$length));
  		_classPrivateFieldSet2(_bits6, this, bits);
  		_classPrivateFieldSet2(_buffer2, this, buffer);
  	}
  	close() {
  		const bits = _classPrivateFieldGet2(_bits6, this);
  		const stream = _classPrivateFieldGet2(_stream, this);
  		if (bits > 0) {
  			stream.writeByte(encode(_classPrivateFieldGet2(_buffer2, this) << 6 - bits));
  			_classPrivateFieldSet2(_bits6, this, 0);
  			_classPrivateFieldSet2(_buffer2, this, 0);
  		}
  		const length = _classPrivateFieldGet2(_length2, this);
  		if (length % 3 != 0) {
  			const pad = 3 - length % 3;
  			for (let i = 0; i < pad; i++) stream.writeByte(61);
  		}
  	}
  });
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module GIFImage
  */
  var GIFImage = (_width = /* @__PURE__ */ new WeakMap(), _height = /* @__PURE__ */ new WeakMap(), _foreground = /* @__PURE__ */ new WeakMap(), _background = /* @__PURE__ */ new WeakMap(), _pixels = /* @__PURE__ */ new WeakMap(), _Class_brand = /* @__PURE__ */ new WeakSet(), class {
  	constructor(width, height, { foreground = [
  		0,
  		0,
  		0
  	], background = [
  		255,
  		255,
  		255
  	] } = {}) {
  		_classPrivateMethodInitSpec(this, _Class_brand);
  		_classPrivateFieldInitSpec(this, _width, void 0);
  		_classPrivateFieldInitSpec(this, _height, void 0);
  		_classPrivateFieldInitSpec(this, _foreground, void 0);
  		_classPrivateFieldInitSpec(this, _background, void 0);
  		_classPrivateFieldInitSpec(this, _pixels, []);
  		_classPrivateFieldSet2(_width, this, width);
  		_classPrivateFieldSet2(_height, this, height);
  		_classPrivateFieldSet2(_foreground, this, foreground);
  		_classPrivateFieldSet2(_background, this, background);
  	}
  	set(x, y, color) {
  		_classPrivateFieldGet2(_pixels, this)[y * _classPrivateFieldGet2(_width, this) + x] = color;
  	}
  	toDataURL() {
  		const bytes = _assertClassBrand(_Class_brand, this, _encode).call(this);
  		const stream = new Base64Stream();
  		for (const byte of bytes) stream.write(byte);
  		stream.close();
  		const base64 = stream.bytes;
  		let url = "data:image/gif;base64,";
  		for (const byte of base64) url += fromCharCode(byte);
  		return url;
  	}
  });
  function _encode() {
  	const width = _classPrivateFieldGet2(_width, this);
  	const height = _classPrivateFieldGet2(_height, this);
  	const stream = new ByteStream();
  	const background = _classPrivateFieldGet2(_background, this);
  	const foreground = _classPrivateFieldGet2(_foreground, this);
  	stream.writeBytes([
  		71,
  		73,
  		70,
  		56,
  		57,
  		97
  	]);
  	stream.writeInt16(width);
  	stream.writeInt16(height);
  	stream.writeBytes([
  		128,
  		0,
  		0
  	]);
  	stream.writeBytes([
  		background[0],
  		background[1],
  		background[2]
  	]);
  	stream.writeBytes([
  		foreground[0],
  		foreground[1],
  		foreground[2]
  	]);
  	stream.writeByte(44);
  	stream.writeInt16(0);
  	stream.writeInt16(0);
  	stream.writeInt16(width);
  	stream.writeInt16(height);
  	stream.writeByte(0);
  	compress(_classPrivateFieldGet2(_pixels, this), 2, stream);
  	stream.writeByte(59);
  	return stream.bytes;
  }
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module Encoded
  */
  var Encoded = (_mask = /* @__PURE__ */ new WeakMap(), _level2 = /* @__PURE__ */ new WeakMap(), _version2 = /* @__PURE__ */ new WeakMap(), _matrix = /* @__PURE__ */ new WeakMap(), class {
  	constructor(matrix, version, level, mask) {
  		_classPrivateFieldInitSpec(this, _mask, void 0);
  		_classPrivateFieldInitSpec(this, _level2, void 0);
  		_classPrivateFieldInitSpec(this, _version2, void 0);
  		_classPrivateFieldInitSpec(this, _matrix, void 0);
  		_classPrivateFieldSet2(_mask, this, mask);
  		_classPrivateFieldSet2(_level2, this, level);
  		_classPrivateFieldSet2(_matrix, this, matrix);
  		_classPrivateFieldSet2(_version2, this, version);
  	}
  	/**
  	* @property matrix
  	* @description Get the size of qrcode.
  	*/
  	get size() {
  		return _classPrivateFieldGet2(_matrix, this).size;
  	}
  	/**
  	* @property mask
  	* @description Get the mask of qrcode.
  	*/
  	get mask() {
  		return _classPrivateFieldGet2(_mask, this);
  	}
  	/**
  	* @property level
  	* @description Get the error correction level of qrcode.
  	*/
  	get level() {
  		return _classPrivateFieldGet2(_level2, this).name;
  	}
  	/**
  	* @property version
  	* @description Get the version of qrcode.
  	*/
  	get version() {
  		return _classPrivateFieldGet2(_version2, this).version;
  	}
  	/**
  	* @method get
  	* @description Get the bit value of the specified coordinate of qrcode.
  	*/
  	get(x, y) {
  		const { size } = _classPrivateFieldGet2(_matrix, this);
  		if (x < 0 || y < 0 || x >= size || y >= size) throw new Error(`illegal coordinate: [${x}, ${y}]`);
  		return _classPrivateFieldGet2(_matrix, this).get(x, y);
  	}
  	/**
  	* @method toDataURL
  	* @param moduleSize The size of one qrcode module
  	* @param options Set rest options of gif, like margin, foreground and background.
  	*/
  	toDataURL(moduleSize = 2, { margin = moduleSize * 4, ...colors } = {}) {
  		moduleSize = Math.max(1, moduleSize >> 0);
  		margin = Math.max(0, margin >> 0);
  		const matrix = _classPrivateFieldGet2(_matrix, this);
  		const matrixSize = matrix.size;
  		const size = moduleSize * matrixSize + margin * 2;
  		const gif = new GIFImage(size, size, colors);
  		const max = size - margin;
  		for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (x >= margin && x < max && y >= margin && y < max) {
  			const offsetX = toInt32((x - margin) / moduleSize);
  			const offsetY = toInt32((y - margin) / moduleSize);
  			gif.set(x, y, matrix.get(offsetX, offsetY));
  		} else gif.set(x, y, 0);
  		return gif.toDataURL();
  	}
  });
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module asserts
  */
  function assertContent(content) {
  	if (content === "") throw new Error("segment content should be at least 1 character");
  }
  function assertCharset(charset) {
  	if (!(charset instanceof Charset)) throw new Error("illegal charset");
  }
  function assertHints(hints) {
  	const { fnc1, structured } = hints;
  	if (fnc1 != null) {
  		const [mode] = fnc1;
  		if (mode !== "GS1" && mode !== "AIM") throw new Error("illegal fnc1 hint");
  		if (mode === "AIM") {
  			const [, indicator] = fnc1;
  			if (indicator < 0 || indicator > 255 || !Number.isInteger(indicator)) throw new Error("illegal fnc1 application indicator");
  		}
  	}
  	if (structured != null) {
  		const { index, count, parity } = structured;
  		if (!Number.isInteger(count) || count < 1 || count > 16) throw new Error("illegal structured append count");
  		if (!Number.isInteger(index) || index < 0 || index >= count) throw new Error("illegal structured append index");
  		if (!Number.isInteger(parity) || parity < 0 || parity > 255) throw new Error("illegal structured append parity");
  	}
  }
  function assertLevel(level) {
  	if ([
  		"L",
  		"M",
  		"Q",
  		"H"
  	].indexOf(level) < 0) throw new Error("illegal error correction level");
  }
  function assertVersion(version) {
  	if (version !== "Auto") {
  		if (version < 1 || version > 40 || !Number.isInteger(version)) throw new Error("illegal version");
  	}
  }
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * Structured Append header (ISO/IEC 18004): mode indicator 0011, the 4-bit symbol position,
  * the 4-bit count minus one, and the 8-bit parity of the whole message. It precedes every other bit,
  * so it is written once, at the head of the first segment.
  */
  function appendStructuredAppendInfo(bits, { index, count, parity }) {
  	bits.append(3, 4);
  	bits.append(index, 4);
  	bits.append(count - 1, 4);
  	bits.append(parity, 8);
  }
  /**
  * @module Encoder
  */
  var Encoder = (_hints = /* @__PURE__ */ new WeakMap(), _level3 = /* @__PURE__ */ new WeakMap(), _encode2 = /* @__PURE__ */ new WeakMap(), _version3 = /* @__PURE__ */ new WeakMap(), class {
  	/**
  	* @constructor
  	* @param options The options of encoder.
  	*/
  	constructor({ hints = {}, level = "L", version = "Auto", encode: encode$1$1 = encode$1 } = {}) {
  		_classPrivateFieldInitSpec(this, _hints, void 0);
  		_classPrivateFieldInitSpec(this, _level3, void 0);
  		_classPrivateFieldInitSpec(this, _encode2, void 0);
  		_classPrivateFieldInitSpec(this, _version3, void 0);
  		assertHints(hints);
  		assertLevel(level);
  		assertVersion(version);
  		_classPrivateFieldSet2(_hints, this, hints);
  		_classPrivateFieldSet2(_encode2, this, encode$1$1);
  		_classPrivateFieldSet2(_version3, this, version);
  		_classPrivateFieldSet2(_level3, this, ECLevel[level]);
  	}
  	/**
  	* @method encode
  	* @description Encode the segments.
  	* @param segments The segments.
  	*/
  	encode(...segments) {
  		const ecLevel = _classPrivateFieldGet2(_level3, this);
  		const encode = _classPrivateFieldGet2(_encode2, this);
  		const { fnc1, structured } = _classPrivateFieldGet2(_hints, this);
  		let isStructuredAppended = false;
  		const versionNumber = _classPrivateFieldGet2(_version3, this);
  		const segmentBlocks = [];
  		let isFNC1Appended = false;
  		let [currentECIValue] = Charset.ISO_8859_1.values;
  		for (const segment of segments) {
  			const { mode } = segment;
  			const head = new BitArray();
  			if (structured != null && !isStructuredAppended) {
  				isStructuredAppended = true;
  				appendStructuredAppendInfo(head, structured);
  			}
  			const body = segment.encode(encode);
  			const length = getSegmentLength(segment, body);
  			currentECIValue = appendECI(head, segment, currentECIValue);
  			if (fnc1 != null && !isFNC1Appended) {
  				isFNC1Appended = true;
  				appendFNC1Info(head, fnc1);
  			}
  			appendModeInfo(head, mode);
  			if (isHanziMode(segment)) head.append(1, 4);
  			segmentBlocks.push({
  				mode,
  				head,
  				body,
  				length
  			});
  		}
  		let version;
  		if (versionNumber === "Auto") version = chooseRecommendVersion(segmentBlocks, ecLevel);
  		else {
  			version = VERSIONS[versionNumber - 1];
  			if (!willFit(calculateBitsNeeded(segmentBlocks, version), version, ecLevel)) throw new Error("data too big for requested version");
  		}
  		const buffer = new BitArray();
  		for (const { mode, head, body, length } of segmentBlocks) {
  			buffer.append(head);
  			appendLengthInfo(buffer, mode, version, length);
  			buffer.append(body);
  		}
  		const ecBlocks = version.getECBlocks(ecLevel);
  		appendTerminator(buffer, ecBlocks.numTotalDataCodewords);
  		const [mask, matrix] = chooseBestMaskAndMatrix(injectECCodewords(buffer, ecBlocks), version, ecLevel);
  		return new Encoded(matrix, version, ecLevel, mask);
  	}
  });
  /**
  * @module QRCode
  * @package @nuintun/qrcode
  * @license MIT
  * @version 5.0.3
  * @author nuintun <nuintun@qq.com>
  * @description A pure JavaScript QRCode encode and decode library.
  * @see https://github.com/nuintun/qrcode#readme
  */
  /**
  * @module Byte
  */
  var Byte = (_content = /* @__PURE__ */ new WeakMap(), _charset = /* @__PURE__ */ new WeakMap(), class {
  	/**
  	* @constructor
  	* @param content The content to encode.
  	* @param charset The charset of the content.
  	*/
  	constructor(content, charset = Charset.ISO_8859_1) {
  		_classPrivateFieldInitSpec(this, _content, void 0);
  		_classPrivateFieldInitSpec(this, _charset, void 0);
  		assertContent(content);
  		assertCharset(charset);
  		_classPrivateFieldSet2(_content, this, content);
  		_classPrivateFieldSet2(_charset, this, charset);
  	}
  	/**
  	* @property mode
  	* @description The mode of the segment.
  	*/
  	get mode() {
  		return Mode.BYTE;
  	}
  	/**
  	* @property content
  	* @description The content of the segment.
  	*/
  	get content() {
  		return _classPrivateFieldGet2(_content, this);
  	}
  	/**
  	* @property charset
  	* @description The charset of the content.
  	*/
  	get charset() {
  		return _classPrivateFieldGet2(_charset, this);
  	}
  	/**
  	* @method encode
  	* @description Encode the segment.
  	* @param encode The text encode function.
  	*/
  	encode(encode) {
  		const bits = new BitArray();
  		const bytes = encode(_classPrivateFieldGet2(_content, this), _classPrivateFieldGet2(_charset, this));
  		for (const byte of bytes) bits.append(byte, 8);
  		return bits;
  	}
  });
  /** A failure this library can name, so callers can tell a bad read from a bad message. */
  var StructuredAppendError = class extends Error {
  	constructor(code, message) {
  		super(message);
  		this.name = "StructuredAppendError";
  		this.code = code;
  	}
  };
  /**
  * The Structured Append parity: every byte of the whole message XORed together.
  *
  * It is what marks symbols as belonging to one message, and all it can do: eight bits, so two
  * unrelated messages share a parity one time in 256. A caller that needs to know which message it has,
  * or that it arrived intact, carries its own identifier and hash inside the message.
  */
  function parityOf(bytes) {
  	let parity = 0;
  	for (const byte of bytes) parity ^= byte;
  	return parity;
  }
  var encoder = new TextEncoder();
  /**
  * Splits a message into the fewest Structured Append symbols that each fit the version cap.
  *
  * Text is carried as its UTF-8 bytes in byte mode, with no ECI, so a symbol boundary may fall inside
  * a character: the bytes are joined before they are decoded as text again. The share of each symbol
  * is balanced rather than filled in order, so no symbol is much denser than the rest.
  */
  function createStructuredAppend(message, options = {}) {
  	const bytes = typeof message === "string" ? encoder.encode(message) : message;
  	if (bytes.length === 0) throw new StructuredAppendError("empty-message", "A message needs at least one byte.");
  	const level = options.level ?? "M";
  	if (![
  		"L",
  		"M",
  		"Q",
  		"H"
  	].includes(level)) throw new StructuredAppendError("invalid-option", `Unknown error correction level ${level}.`);
  	const maxVersion = options.maxVersion ?? 40;
  	if (!Number.isInteger(maxVersion) || maxVersion < 1 || maxVersion > 40) throw new StructuredAppendError("invalid-option", `A version cap is a whole number from 1 to 40, not ${String(maxVersion)}.`);
  	const parity = parityOf(bytes);
  	const perSymbol = capacity(level, maxVersion);
  	const count = Math.ceil(bytes.length / perSymbol);
  	if (count > 16) throw new StructuredAppendError("too-many-symbols", `The message needs ${count} symbols at version ${maxVersion}, more than the 16 the standard allows.`);
  	const share = Math.ceil(bytes.length / count);
  	return Array.from({ length: count }, (_, index) => {
  		const part = bytes.slice(index * share, (index + 1) * share);
  		const encoded = new Encoder({
  			level,
  			hints: { structured: {
  				index,
  				count,
  				parity
  			} }
  		}).encode(new Byte(latin1$1(part), Charset.ISO_8859_1));
  		return symbol(index, count, parity, part, encoded);
  	});
  }
  /** How many bytes one symbol carries at the cap, found by asking the encoder. */
  function capacity(level, version) {
  	const fits = (length) => {
  		try {
  			new Encoder({
  				level,
  				version,
  				hints: { structured: {
  					index: 15,
  					count: 16,
  					parity: 0
  				} }
  			}).encode(new Byte("A".repeat(length), Charset.ISO_8859_1));
  			return true;
  		} catch {
  			return false;
  		}
  	};
  	let low = 0;
  	let high = 3e3;
  	while (low < high) {
  		const middle = Math.ceil((low + high) / 2);
  		if (fits(middle)) low = middle;
  		else high = middle - 1;
  	}
  	if (low < 1) throw new StructuredAppendError("invalid-option", `Version ${version} at level ${level} has no room for data after the Structured Append header.`);
  	return low;
  }
  /** Bytes as the ISO-8859-1 string the byte-mode segment takes: one character per byte. */
  function latin1$1(bytes) {
  	let text = "";
  	for (const byte of bytes) text += String.fromCharCode(byte);
  	return text;
  }
  function symbol(index, count, parity, bytes, encoded) {
  	const isDark = (x, y) => encoded.get(x, y) === 1;
  	const toSvg = (svg = {}) => {
  		const quiet = svg.quietZone ?? 4;
  		const total = encoded.size + quiet * 2;
  		const runs = [];
  		for (let y = 0; y < encoded.size; y += 1) {
  			let x = 0;
  			while (x < encoded.size) {
  				if (!isDark(x, y)) {
  					x += 1;
  					continue;
  				}
  				const start = x;
  				while (x < encoded.size && isDark(x, y)) x += 1;
  				runs.push(`M${start + quiet} ${y + quiet}h${x - start}v1h-${x - start}z`);
  			}
  		}
  		return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="${svg.light ?? "#ffffff"}"/><path fill="${svg.dark ?? "#000000"}" d="${runs.join("")}"/></svg>`;
  	};
  	return {
  		index,
  		count,
  		parity,
  		bytes,
  		version: encoded.version,
  		size: encoded.size,
  		isDark,
  		toSvg,
  		toDataUri: (svg) => `data:image/svg+xml,${encodeURIComponent(toSvg(svg))}`
  	};
  }
  /**
  * Collects the symbols of one message, in any order, from any decoder.
  *
  * The first symbol read decides the message — its count and parity. A symbol of a different message
  * is reported and left out, rather than failing the message, because a camera also sees whatever else
  * is in front of it. A symbol whose position is already filled with different content is damage to
  * this message, and throws.
  */
  var StructuredAppendAssembler = class {
  	constructor() {
  		this.symbols = /* @__PURE__ */ new Map();
  		this.expectedCount = 0;
  		this.expectedParity = -1;
  	}
  	add(read) {
  		requireRead(read);
  		if (this.expectedCount === 0) {
  			this.expectedCount = read.count;
  			this.expectedParity = read.parity;
  		}
  		if (read.count !== this.expectedCount || read.parity !== this.expectedParity) return this.outcome("foreign", read.index);
  		const existing = this.symbols.get(read.index);
  		if (existing) {
  			if (!sameBytes(existing, read.bytes)) throw new StructuredAppendError("conflicting-symbol", `Symbol ${read.index + 1} of ${read.count} arrived twice with different content.`);
  			return this.outcome("duplicate", read.index);
  		}
  		this.symbols.set(read.index, read.bytes.slice());
  		return this.outcome("accepted", read.index);
  	}
  	received() {
  		return this.symbols.size;
  	}
  	/** Symbols in the message, or 0 before the first read. */
  	count() {
  		return this.expectedCount;
  	}
  	/** 0-based positions still missing, in order. */
  	missing() {
  		const missing = [];
  		for (let index = 0; index < this.expectedCount; index += 1) if (!this.symbols.has(index)) missing.push(index);
  		return missing;
  	}
  	isComplete() {
  		return this.expectedCount > 0 && this.symbols.size === this.expectedCount;
  	}
  	/** The message, joined in order and checked against its parity. */
  	bytes() {
  		if (!this.isComplete()) throw new StructuredAppendError("incomplete", `The message is missing ${this.expectedCount - this.symbols.size} of ${this.expectedCount} symbols.`);
  		const parts = Array.from({ length: this.expectedCount }, (_, index) => this.symbols.get(index));
  		const joined = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  		let offset = 0;
  		for (const part of parts) {
  			joined.set(part, offset);
  			offset += part.length;
  		}
  		if (parityOf(joined) !== this.expectedParity) throw new StructuredAppendError("parity-mismatch", "The joined message does not match the parity its symbols carry.");
  		return joined;
  	}
  	/** The message as UTF-8 text. */
  	text() {
  		return new TextDecoder().decode(this.bytes());
  	}
  	clear() {
  		this.symbols.clear();
  		this.expectedCount = 0;
  		this.expectedParity = -1;
  	}
  	outcome(result, index) {
  		return {
  			result,
  			index,
  			received: this.symbols.size,
  			count: this.expectedCount
  		};
  	}
  };
  function requireRead(read) {
  	const whole = (value, low, high) => Number.isInteger(value) && value >= low && value <= high;
  	if (!whole(read.count, 1, 16) || !whole(read.index, 0, read.count - 1) || !whole(read.parity, 0, 255) || !(read.bytes instanceof Uint8Array)) throw new StructuredAppendError("invalid-read", "A Structured Append read needs a position below its count (1 to 16), a parity byte and bytes.");
  }
  function sameBytes(left, right) {
  	if (left.length !== right.length) return false;
  	for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  	return true;
  }
  //#endregion
  //#region src/qr/hash.ts
  /**
  * SHA-256 as unpadded base64url.
  *
  * The digest detects optical transport damage. It is not an authentication
  * mechanism: anyone who can photograph the QR codes can also recompute it.
  */
  async function sha256Base64Url(value) {
  	const bytes = new TextEncoder().encode(value);
  	const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  	let binary = "";
  	for (const byte of digest) binary += String.fromCharCode(byte);
  	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
  }
  //#endregion
  //#region src/qr/message.ts
  /**
  * Transport format identifier.
  *
  * `twqr/1` put a JSON envelope into every QR code. `twqr/2` puts one message
  * into a Structured Append sequence (ISO/IEC 18004), so the split is the
  * standard's, and a reader that knows the standard knows which code is which.
  * The two are not compatible, and `twqr/1` is rejected with
  * `unsupported-protocol`.
  */
  var QR_PROTOCOL = "twqr/2";
  /** Printable ASCII. Pairing codes are base64url, so this never rejects a valid payload. */
  var printableAscii = /^[ -~]+$/u;
  var base64Url = /^[A-Za-z0-9_-]+$/u;
  var headerKeys = [
  	"sessionId",
  	"senderPeerId",
  	"targetPeerId",
  	"kind",
  	"messageId",
  	"replyTo",
  	"createdAt",
  	"messageLength",
  	"messageHash"
  ];
  /**
  * The text a message is carried as: the protocol, the header as JSON, and the
  * pairing code, one per line. The header comes first so that the first QR code
  * of a sequence tells a reader whether the sequence is for it.
  */
  function formatMessage(message) {
  	validateHeader(message.header);
  	requirePayload(message.payload, "invalid-argument");
  	const header = {};
  	for (const key of headerKeys) header[key] = message.header[key];
  	return `${QR_PROTOCOL}\n${JSON.stringify(header)}\n${message.payload}`;
  }
  /** Reads a whole message. The hash is checked separately, because it is asynchronous. */
  function parseMessage(text) {
  	if (typeof text !== "string") throw new QrPairingError("invalid-envelope", "Pairing message must be text.");
  	if (text.length > 34816) throw new QrPairingError("message-too-large", "Pairing message is too long.");
  	const header = parseHeader(text);
  	if (!header) throw new QrPairingError("invalid-envelope", "Pairing message has no pairing code.");
  	const payload = text.slice(text.indexOf("\n", 7) + 1);
  	requirePayload(payload, "invalid-envelope");
  	if (payload.length !== header.messageLength) throw new QrPairingError("length-mismatch", "Pairing code has the wrong length.");
  	return {
  		header,
  		payload
  	};
  }
  /**
  * Reads the header from the start of a message, such as the first code of a
  * sequence. Returns undefined while the header line has not ended yet; throws
  * as soon as the text cannot be a pairing message.
  */
  function parseHeader(prefix) {
  	const protocolEnd = prefix.indexOf("\n");
  	const protocol = protocolEnd < 0 ? prefix : prefix.slice(0, protocolEnd);
  	if (protocolEnd < 0 ? !"twqr/2".startsWith(protocol) : protocol !== "twqr/2") throw new QrPairingError("unsupported-protocol", `Pairing message protocol must be ${QR_PROTOCOL}.`);
  	if (protocolEnd < 0) return void 0;
  	const headerEnd = prefix.indexOf("\n", protocolEnd + 1);
  	if (headerEnd < 0) {
  		if (prefix.length - protocolEnd > 2048) throw new QrPairingError("invalid-envelope", "Pairing message header is too long.");
  		return;
  	}
  	let parsed;
  	try {
  		parsed = JSON.parse(prefix.slice(protocolEnd + 1, headerEnd));
  	} catch (error) {
  		throw new QrPairingError("invalid-json", "Pairing message header is not valid JSON.", { cause: error });
  	}
  	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new QrPairingError("invalid-envelope", "Pairing message header must be an object.");
  	const header = parsed;
  	validateHeader(header);
  	return header;
  }
  function validateHeader(header) {
  	requireIdentifier(header.sessionId, "session ID");
  	requireIdentifier(header.senderPeerId, "sender peer ID");
  	requireIdentifier(header.targetPeerId, "target peer ID");
  	requireIdentifier(header.messageId, "message ID");
  	if (header.kind !== "offer" && header.kind !== "answer") throw new QrPairingError("invalid-envelope", "Pairing message kind must be offer or answer.");
  	if (header.kind === "answer") requireIdentifier(header.replyTo, "reply-to message ID");
  	else if (header.replyTo !== "") throw new QrPairingError("invalid-envelope", "An offer must not set reply-to.");
  	if (!Number.isSafeInteger(header.createdAt) || header.createdAt < 0) throw new QrPairingError("invalid-envelope", "Pairing message timestamp is invalid.");
  	if (!Number.isInteger(header.messageLength) || header.messageLength < 1) throw new QrPairingError("invalid-envelope", "Pairing code length must be a positive integer.");
  	if (header.messageLength > 32768) throw new QrPairingError("message-too-large", `Pairing code must be at most ${MAX_MESSAGE_LENGTH} characters.`);
  	if (typeof header.messageHash !== "string" || header.messageHash.length !== 43 || !base64Url.test(header.messageHash)) throw new QrPairingError("invalid-envelope", "Pairing message hash is malformed.");
  }
  function requireIdentifier(value, label) {
  	if (typeof value !== "string" || value.length < 1 || value.length > 128 || !printableAscii.test(value)) throw new QrPairingError("invalid-envelope", `Invalid ${label}.`);
  	return value;
  }
  function requirePayload(value, code) {
  	if (typeof value !== "string" || value.length < 1) throw new QrPairingError(code, "Pairing code is empty.");
  	if (value.length > 32768) throw new QrPairingError("message-too-large", `Pairing code must be at most ${MAX_MESSAGE_LENGTH} characters.`);
  	if (!printableAscii.test(value)) throw new QrPairingError(code, "Pairing code must be printable ASCII.");
  }
  //#endregion
  //#region src/qr/courier.ts
  /** Wraps a pairing code in its header and splits it into a Structured Append sequence. */
  async function createPairingCodes(payload, options) {
  	const senderPeerId = requireArgument(options.senderPeerId, "sender peer ID");
  	const targetPeerId = requireArgument(options.targetPeerId, "target peer ID");
  	if (options.kind !== "offer" && options.kind !== "answer") throw new QrPairingError("invalid-argument", "QR message kind must be offer or answer.");
  	const replyTo = options.kind === "answer" ? requireArgument(options.replyTo ?? "", "reply-to message ID") : "";
  	if (options.kind === "offer" && (options.replyTo ?? "") !== "") throw new QrPairingError("invalid-argument", "An offer must not set reply-to.");
  	const sessionId = requireArgument(options.sessionId ?? crypto.randomUUID(), "session ID");
  	const createdAt = options.createdAt ?? Date.now();
  	if (!Number.isSafeInteger(createdAt) || createdAt < 0) throw new QrPairingError("invalid-argument", "QR creation timestamp is invalid.");
  	const maxVersion = requireVersion(options.maxVersion ?? 15);
  	if (typeof payload !== "string" || payload.length < 1) throw new QrPairingError("invalid-argument", "Pairing code is empty.");
  	const messageHash = await sha256Base64Url(payload);
  	const messageId = `${sessionId}.${messageHash.slice(0, 12)}`;
  	const text = formatMessage({
  		header: {
  			sessionId,
  			senderPeerId,
  			targetPeerId,
  			kind: options.kind,
  			messageId,
  			replyTo,
  			createdAt,
  			messageLength: payload.length,
  			messageHash
  		},
  		payload
  	});
  	let symbols;
  	try {
  		symbols = createStructuredAppend(text, {
  			level: options.errorCorrectionLevel ?? "M",
  			maxVersion
  		});
  	} catch (error) {
  		if (error instanceof StructuredAppendError && error.code === "too-many-symbols") throw new QrPairingError("too-many-parts", `The pairing code needs more than 16 QR codes at version ${maxVersion}.`, { cause: error });
  		throw new QrPairingError("invalid-argument", "The pairing code cannot be made into QR codes.", { cause: error });
  	}
  	return {
  		symbols,
  		svgs: symbols.map((symbol) => symbol.toSvg()),
  		text,
  		sessionId,
  		messageId
  	};
  }
  /** Reads the whole message the codes carry, and checks it against its hash. */
  async function readPairingMessage(text) {
  	const message = parseMessage(text);
  	if (await sha256Base64Url(message.payload) !== message.header.messageHash) throw new QrPairingError("hash-mismatch", "The pairing code failed its hash check.");
  	return message;
  }
  /**
  * Collects the codes of one pairing message, in any order.
  *
  * The first code read decides the sequence. The header comes first in the
  * message, so the codes from the first onwards tell whose message it is before
  * all of them have arrived — in the first code alone at the default settings,
  * across the first few when codes are small or the error correction is high.
  */
  var PairingAssembler = class {
  	constructor() {
  		this.inner = new StructuredAppendAssembler();
  		this.shares = /* @__PURE__ */ new Map();
  		this.headerVerified = false;
  	}
  	/** Throws `conflicting-part` for a position that arrives twice with different content. */
  	add(read) {
  		let outcome;
  		try {
  			outcome = this.inner.add(read);
  		} catch (error) {
  			throw translate(error);
  		}
  		if (outcome.result === "accepted") this.shares.set(read.index, read.bytes);
  		return outcome;
  	}
  	/**
  	* The header, once the codes from the first onwards hold all of it.
  	* Undefined while they do not; throws as soon as they cannot be a pairing
  	* message, or the header is malformed.
  	*/
  	header() {
  		let prefix = "";
  		for (let index = 0; this.shares.has(index); index += 1) prefix += latin1(this.shares.get(index) ?? /* @__PURE__ */ new Uint8Array());
  		return prefix === "" ? void 0 : parseHeader(prefix);
  	}
  	isEmpty() {
  		return this.inner.received() === 0;
  	}
  	receivedCount() {
  		return this.inner.received();
  	}
  	/** Zero until the first code arrives, because the count is carried by the codes. */
  	requiredCount() {
  		return this.inner.count();
  	}
  	/** Zero-based positions that have not arrived yet, in ascending order. */
  	missingParts() {
  		return this.inner.missing();
  	}
  	isComplete() {
  		return this.inner.isComplete();
  	}
  	/** Joins the codes and checks the result before returning anything. */
  	async assemble() {
  		let text;
  		try {
  			text = this.inner.text();
  		} catch (error) {
  			throw translate(error);
  		}
  		return readPairingMessage(text);
  	}
  	clear() {
  		this.inner.clear();
  		this.shares.clear();
  		this.headerVerified = false;
  	}
  };
  /** A QR version is a whole number from 1 to 40. */
  function requireVersion(value) {
  	if (!Number.isInteger(value) || value < 1 || value > 40) throw new QrPairingError("invalid-argument", `QR version cap must be a whole number from 1 to 40, not ${String(value)}.`);
  	return value;
  }
  function requireArgument(value, label) {
  	try {
  		return requireIdentifier(value, label);
  	} catch (error) {
  		throw new QrPairingError("invalid-argument", `Invalid ${label}.`, { cause: error });
  	}
  }
  function translate(error) {
  	if (!(error instanceof StructuredAppendError)) return error;
  	switch (error.code) {
  		case "conflicting-symbol": return new QrPairingError("conflicting-part", error.message, { cause: error });
  		case "incomplete": return new QrPairingError("missing-parts", error.message, { cause: error });
  		case "parity-mismatch": return new QrPairingError("hash-mismatch", error.message, { cause: error });
  		default: return new QrPairingError("invalid-envelope", error.message, { cause: error });
  	}
  }
  /** Pairing messages are ASCII, so each byte of a code is one character. */
  function latin1(bytes) {
  	let text = "";
  	for (const byte of bytes) text += String.fromCharCode(byte);
  	return text;
  }
  //#endregion
  //#region src/pairing/limits.ts
  var MAX_TIMEOUT_SECONDS = 3600;
  //#endregion
  //#region src/pairing/types.ts
  var terminalPhases = /* @__PURE__ */ new Set([
  	"connected",
  	"cancelled",
  	"expired",
  	"failed"
  ]);
  function isTerminalPhase(phase) {
  	return terminalPhases.has(phase);
  }
  //#endregion
  //#region src/ports/display.ts
  /**
  * Swaps a sprite's skin for a QR image and puts the original back.
  *
  * The original skin ID is captured on the first swap so that repeated part
  * changes never lose it, and every exit path restores it: ending the display,
  * cancelling, stopping the project, removing the sprite, or disposing the
  * runtime.
  */
  var TemporarySpriteSkinManager = class {
  	constructor(runtime) {
  		this.runtime = runtime;
  		this.displays = /* @__PURE__ */ new Map();
  	}
  	validateTarget(target) {
  		if (!target || target.isStage) throw new QrPairingError("invalid-argument", "A pairing QR must be displayed on a sprite target.");
  		if (target.isOriginal === false) throw new QrPairingError("invalid-argument", "Pairing QR display does not support sprite clones.");
  		if (!Number.isInteger(target.drawableID) || Number(target.drawableID) < 0) throw new QrPairingError("renderer-unavailable", "The pairing QR sprite target has no valid drawable.");
  		return target;
  	}
  	show(targetValue, svg) {
  		const target = this.validateTarget(targetValue);
  		const renderer = requireRenderer(this.runtime.renderer);
  		const drawableId = Number(target.drawableID);
  		const current = this.displays.get(target);
  		const originalSkinId = current?.originalSkinId ?? currentSkinId(renderer, drawableId);
  		const temporarySkinId = renderer.createSVGSkin(svg);
  		if (!Number.isInteger(temporarySkinId) || temporarySkinId < 0) throw new QrPairingError("renderer-unavailable", "The renderer could not create a temporary QR skin.");
  		try {
  			renderer.updateDrawableSkinId(drawableId, temporarySkinId);
  		} catch (error) {
  			renderer.destroySkin(temporarySkinId);
  			throw new QrPairingError("renderer-unavailable", "The renderer could not display the temporary QR skin.", { cause: error });
  		}
  		this.displays.set(target, {
  			target,
  			drawableId,
  			originalSkinId,
  			temporarySkinId
  		});
  		if (current) renderer.destroySkin(current.temporarySkinId);
  		this.runtime.requestRedraw?.();
  		return target;
  	}
  	releaseTarget(target) {
  		const record = this.displays.get(target);
  		if (!record) return;
  		this.displays.delete(target);
  		const renderer = this.runtime.renderer;
  		try {
  			if (renderer?.updateDrawableSkinId && this.runtime.targets?.includes(target) !== false) renderer.updateDrawableSkinId(record.drawableId, record.originalSkinId);
  		} finally {
  			renderer?.destroySkin?.(record.temporarySkinId);
  			this.runtime.requestRedraw?.();
  		}
  	}
  	releaseAll() {
  		for (const target of [...this.displays.keys()]) this.releaseTarget(target);
  	}
  	isDisplaying(target) {
  		return this.displays.has(target);
  	}
  };
  function requireRenderer(renderer) {
  	if (!renderer || typeof renderer.createSVGSkin !== "function" || typeof renderer.destroySkin !== "function" || typeof renderer.updateDrawableSkinId !== "function") throw new QrPairingError("renderer-unavailable", "The TurboWarp renderer does not provide temporary SVG skin APIs.");
  	return renderer;
  }
  function currentSkinId(renderer, drawableId) {
  	const skinId = renderer._allDrawables?.[drawableId]?._skin?._id;
  	if (!Number.isInteger(skinId) || Number(skinId) < 0) throw new QrPairingError("renderer-unavailable", "The renderer could not determine the sprite original skin.");
  	return Number(skinId);
  }
  //#endregion
  //#region src/ports/qr-scan.ts
  var QR_DECODER_KEY = "ext_kubohiroyajsqr";
  var CAMERA_SOURCE_KEY = "ext_kubohiroyacamerasource";
  /**
  * Reads QR codes from a camera for the length of a pairing session.
  *
  * The jsQR extension's own `waitForQrText` acquires and releases a camera lease
  * per call, which would restart the camera between every part. This holds one
  * lease for the whole session instead and reuses jsQR only for decoding, so the
  * camera-source lease rules are respected and other holders keep the camera
  * alive after the session ends.
  */
  var CameraQrScanner = class {
  	constructor(runtime, owner) {
  		this.runtime = runtime;
  		this.owner = owner;
  		this.leasedCameraId = "";
  		this.nextReadAt = 0;
  	}
  	async scanOnce(options) {
  		if (options.signal.aborted) throw cancelled();
  		const decoder = this.decoder();
  		const lease = await this.acquire(options.cameraId);
  		if (options.signal.aborted) throw cancelled();
  		const interval = Math.max(50, options.intervalMilliseconds ?? 150);
  		return new Promise((resolve, reject) => {
  			let timer;
  			let settled = false;
  			const cleanup = () => {
  				settled = true;
  				if (timer !== void 0) clearTimeout(timer);
  				options.signal.removeEventListener("abort", onAbort);
  			};
  			const onAbort = () => {
  				cleanup();
  				reject(cancelled());
  			};
  			const tick = async () => {
  				timer = void 0;
  				if (settled) return;
  				if (options.signal.aborted) {
  					onAbort();
  					return;
  				}
  				let read;
  				try {
  					read = await decoder.readFrame(lease.getFrameSource());
  				} catch (error) {
  					if (settled) return;
  					cleanup();
  					reject(new QrPairingError("camera-unavailable", "Reading the camera frame failed.", { cause: error }));
  					return;
  				}
  				if (settled) return;
  				if (read !== null) {
  					this.nextReadAt = Date.now() + interval;
  					cleanup();
  					resolve(read);
  					return;
  				}
  				timer = setTimeout(() => void tick(), interval);
  			};
  			options.signal.addEventListener("abort", onAbort, { once: true });
  			timer = setTimeout(() => void tick(), Math.max(0, this.nextReadAt - Date.now()));
  		});
  	}
  	async release() {
  		const lease = this.lease;
  		this.lease = void 0;
  		this.leasedCameraId = "";
  		await lease?.release();
  	}
  	async acquire(cameraId) {
  		if (this.lease && this.leasedCameraId === cameraId) return this.lease;
  		await this.release();
  		const lease = await this.cameraSource().acquireCamera({
  			owner: this.owner,
  			cameraId
  		});
  		this.lease = lease;
  		this.leasedCameraId = cameraId;
  		return lease;
  	}
  	decoder() {
  		const candidate = this.runtime[QR_DECODER_KEY];
  		if (!isRecord(candidate) || typeof candidate.readFrame !== "function") throw new QrPairingError("qr-decoder-missing", "Scanning pairing QR codes requires @kubohiroya/turbowarp-jsqr 0.4.0 or later.");
  		const version = candidate.capabilityVersion;
  		if (typeof version !== "number" || version < 2) throw new QrPairingError("qr-decoder-missing", "Scanning pairing QR codes requires @kubohiroya/turbowarp-jsqr 0.4.0 or later, which reads Structured Append codes.");
  		return candidate;
  	}
  	cameraSource() {
  		const candidate = this.runtime[CAMERA_SOURCE_KEY];
  		if (!isRecord(candidate) || typeof candidate.acquireCamera !== "function") throw new QrPairingError("camera-unavailable", "Scanning pairing QR codes requires @kubohiroya/turbowarp-camera-source.");
  		return candidate;
  	}
  };
  function cancelled() {
  	return new QrPairingError("cancelled", "QR scanning was cancelled.");
  }
  function isRecord(value) {
  	return typeof value === "object" && value !== null;
  }
  //#endregion
  //#region src/ports/webrtc.ts
  var WEBRTC_CAPABILITY_KEY = "kubohiroyaWebRtcCapability";
  var requiredMethods = [
  	"requireVersion",
  	"createOffer",
  	"getOffer",
  	"acceptOffer",
  	"getAnswer",
  	"acceptAnswer",
  	"connectionState",
  	"closePeer"
  ];
  function requireWebRtcPairingPort(runtime) {
  	const candidate = runtime[WEBRTC_CAPABILITY_KEY];
  	if (typeof candidate !== "object" || candidate === null) throw new QrPairingError("webrtc-capability-missing", "TurboWarp WebRTC is not loaded.");
  	const record = candidate;
  	for (const method of requiredMethods) if (typeof record[method] !== "function") throw new QrPairingError("webrtc-capability-missing", `TurboWarp WebRTC runtime capability v3 is required.`);
  	try {
  		record.requireVersion(3);
  	} catch (error) {
  		throw new QrPairingError("webrtc-capability-missing", `TurboWarp WebRTC runtime capability v3 is required.`, { cause: error });
  	}
  	return candidate;
  }
  //#endregion
  //#region src/pairing/controller.ts
  /** Errors that mean the text is not a pairing message at all. They are not reported as reads. */
  var unreportedCodes = /* @__PURE__ */ new Set([
  	"invalid-json",
  	"unsupported-protocol",
  	"invalid-envelope",
  	"message-too-large"
  ]);
  /**
  * Errors that only mean "that was not a code this exchange can use".
  *
  * A camera pointed at a projection also sees posters, other sessions, and the
  * previous exchange's codes, so scanning skips these and keeps looking. A
  * sequence that arrives damaged is in this set too: it has been dropped and
  * reported, and the codes are still being shown, so reading on collects it
  * again.
  */
  var skippableWhileScanning = /* @__PURE__ */ new Set([
  	...unreportedCodes,
  	"unexpected-kind",
  	"stale-exchange",
  	"peer-mismatch",
  	"reply-mismatch",
  	"message-mismatch",
  	"conflicting-part",
  	"length-mismatch",
  	"hash-mismatch"
  ]);
  var idlePhase = "idle";
  /**
  * Drives one QR-carried offer/answer exchange per session key.
  *
  * The controller owns no display and no camera: it turns pairing codes into
  * Structured Append QR sequences, accepts decoded codes back in any order, and
  * hands verified pairing codes to WebRTC exactly once. Display and scanning adapters build on top of it.
  */
  var PairingController = class {
  	constructor(options = {}) {
  		this.sessions = /* @__PURE__ */ new Map();
  		this.activeScans = 0;
  		this.runtime = options.runtime ?? Scratch.vm?.runtime ?? {};
  		this.enabled = options.enabled ?? featureFlags.qrCodePairing;
  		this.errorCorrectionLevel = options.errorCorrectionLevel ?? qrConfig.errorCorrectionLevel;
  		this.offerMaxVersion = options.offerMaxVersion ?? qrConfig.offerMaxVersion;
  		this.answerMaxVersion = options.answerMaxVersion ?? qrConfig.answerMaxVersion;
  		this.injectedWebRtc = options.webrtc;
  		this.injectedDisplay = options.display;
  		this.injectedScan = options.scan;
  		this.clock = options.clock ?? systemMonotonicClock;
  		this.now = options.now ?? (() => Date.now());
  	}
  	/** Hub side: create an offer and prepare its pairing messages. */
  	async startOfferPairing(input) {
  		this.requireEnabled();
  		const sessionKey = requireSessionKey(input.sessionKey);
  		if (this.sessions.has(sessionKey)) throw new QrPairingError("session-exists", `Pairing session ${sessionKey} is already open.`);
  		this.requireCapacity();
  		const localPeerId = requireIdentifier(input.localPeerId.trim(), "local peer name");
  		const remotePeerId = requireIdentifier(input.remotePeerId.trim(), "remote peer name");
  		const session = this.createSession({
  			sessionKey,
  			role: "hub",
  			expectedLocalPeerId: localPeerId,
  			localPeerId,
  			remotePeerId
  		});
  		this.sessions.set(sessionKey, session);
  		await this.runOfferExchange(session);
  	}
  	/**
  	* Camera side: wait for an offer.
  	*
  	* `expectedLocalPeerId` may be empty, in which case this device adopts the
  	* name the offer assigns to it. A non-empty value is verified instead, which
  	* catches an operator scanning the wrong projection.
  	*/
  	startAnswerPairing(input) {
  		this.requireEnabled();
  		const sessionKey = requireSessionKey(input.sessionKey);
  		if (this.sessions.has(sessionKey)) throw new QrPairingError("session-exists", `Pairing session ${sessionKey} is already open.`);
  		this.requireCapacity();
  		const expectedLocalPeerId = input.expectedLocalPeerId.trim();
  		if (expectedLocalPeerId !== "") requireIdentifier(expectedLocalPeerId, "local peer name");
  		const session = this.createSession({
  			sessionKey,
  			role: "camera",
  			expectedLocalPeerId,
  			localPeerId: expectedLocalPeerId,
  			remotePeerId: ""
  		});
  		session.phase = "awaiting-offer";
  		this.sessions.set(sessionKey, session);
  		this.scheduleTick(session);
  	}
  	/**
  	* Accepts one decoded QR code. The codes of a Structured Append sequence may
  	* arrive in any order and any number of times; when the last one arrives,
  	* the message is checked and its pairing code handed to WebRTC once.
  	*
  	* A lone code — one that is not part of a sequence — is read as a whole
  	* message, the way `ingestQrText` reads one.
  	*
  	* Reads of one session are taken one at a time, in the order they came, so
  	* two scripts feeding codes at once cannot both complete the message.
  	*/
  	async ingestQrRead(sessionKey, read) {
  		this.requireEnabled();
  		const session = this.requireSession(sessionKey);
  		return this.inTurn(session, () => this.takeRead(session, read));
  	}
  	/**
  	* Accepts a whole pairing message as text, the way it would arrive through
  	* something other than a camera, or in one QR code.
  	*/
  	async ingestQrText(sessionKey, text) {
  		this.requireEnabled();
  		const session = this.requireSession(sessionKey);
  		return this.inTurn(session, () => this.takeText(session, text));
  	}
  	/** Runs `work` after every read of the session that came before it has finished. */
  	inTurn(session, work) {
  		const turn = session.readQueue.then(work);
  		session.readQueue = turn.catch(() => void 0);
  		return turn;
  	}
  	async takeRead(session, read) {
  		this.requireOpen(session);
  		const position = read.structuredAppend;
  		if (position === null) {
  			await this.takeText(session, read.text);
  			return;
  		}
  		const symbol = {
  			...position,
  			bytes: read.bytes
  		};
  		const part = `${symbol.index + 1} / ${symbol.count}`;
  		if (session.delivered) {
  			let repeat = false;
  			try {
  				repeat = session.assembler.add(symbol).result === "duplicate";
  			} catch (error) {
  				if (!isReported(error)) throw error;
  			}
  			this.noteRead(session, repeat ? "duplicate" : "foreign", repeat ? part : "message-mismatch");
  			throw alreadyAccepted();
  		}
  		let outcome = this.addTo(session, session.assembler, symbol);
  		if (outcome.result === "foreign" && !session.assembler.headerVerified) outcome = this.offerToCandidate(session, symbol) ?? outcome;
  		if (outcome.result === "foreign") {
  			this.noteRead(session, "foreign", "message-mismatch");
  			throw new QrPairingError("message-mismatch", "QR code belongs to another sequence than the one being collected.");
  		}
  		const assembler = session.assembler;
  		if (outcome.result === "accepted" && !assembler.headerVerified) try {
  			const header = assembler.header();
  			if (header) {
  				this.verifyHeader(session, header);
  				assembler.headerVerified = true;
  			}
  		} catch (error) {
  			assembler.clear();
  			if (!isReported(error)) throw error;
  			this.noteRead(session, "foreign", codeOf(error));
  			throw error;
  		}
  		session.phase = session.role === "hub" ? "awaiting-answer" : "receiving";
  		if (!assembler.isComplete()) {
  			this.noteRead(session, outcome.result, part);
  			return;
  		}
  		const epoch = session.epoch;
  		let message;
  		try {
  			message = await assembler.assemble();
  			if (this.isStale(session, epoch)) return;
  			this.verifyHeader(session, message.header);
  		} catch (error) {
  			if (this.isStale(session, epoch)) return;
  			assembler.clear();
  			this.noteRead(session, "foreign", codeOf(error));
  			throw error;
  		}
  		assembler.headerVerified = true;
  		this.noteRead(session, "accepted", part);
  		await this.deliver(session, message, epoch);
  	}
  	async takeText(session, text) {
  		this.requireOpen(session);
  		const epoch = session.epoch;
  		const message = await readPairingMessage(text);
  		if (this.isStale(session, epoch)) return;
  		try {
  			this.verifyHeader(session, message.header);
  		} catch (error) {
  			this.noteRead(session, "foreign", codeOf(error));
  			throw error;
  		}
  		if (session.delivered) {
  			this.noteRead(session, "duplicate", "1 / 1");
  			throw alreadyAccepted();
  		}
  		this.noteRead(session, "accepted", "1 / 1");
  		await this.deliver(session, message, epoch);
  	}
  	/**
  	* Adds a code to a sequence. A position read twice with different content
  	* means this sequence is damaged, so it is dropped and collected again from
  	* the codes still being shown. Anything else wrong with the code leaves the
  	* sequence as it was.
  	*/
  	addTo(session, assembler, symbol) {
  		try {
  			return assembler.add(symbol);
  		} catch (error) {
  			if (codeOf(error) !== "conflicting-part") throw error;
  			assembler.clear();
  			this.noteRead(session, "foreign", "conflicting-part");
  			throw error;
  		}
  	}
  	/**
  	* Collects a code of another sequence on the side, while the sequence held
  	* has not shown whose it is. If the other sequence's header shows it is this
  	* exchange's, it takes the place of the one held.
  	*
  	* A camera that first catches a stray code of an old projection would
  	* otherwise wait for the rest of that old sequence forever. Returns the
  	* outcome in the sequence that took over, or undefined when nothing changed.
  	*/
  	offerToCandidate(session, symbol) {
  		const candidate = session.candidate;
  		try {
  			let outcome = candidate.add(symbol);
  			if (outcome.result === "foreign") {
  				candidate.clear();
  				outcome = candidate.add(symbol);
  			}
  			const header = candidate.header();
  			if (!header) return void 0;
  			this.verifyHeader(session, header);
  			candidate.headerVerified = true;
  			session.assembler = candidate;
  			session.candidate = new PairingAssembler();
  			return outcome;
  		} catch {
  			candidate.clear();
  			return;
  		}
  	}
  	/** Hands a checked pairing code to WebRTC, once per exchange. */
  	async deliver(session, message, epoch) {
  		if (session.role === "camera" && session.exchangeId === "") this.adoptOffer(session, message.header);
  		session.incomingMessageId = message.header.messageId;
  		session.phase = session.role === "hub" ? "answer-received" : "offer-received";
  		session.delivered = true;
  		if (session.role === "hub") await this.acceptAnswer(session, message.payload, epoch);
  		else await this.acceptOfferAndPrepareAnswer(session, message.payload, epoch);
  	}
  	requireOpen(session) {
  		if (isTerminalPhase(session.phase)) throw new QrPairingError(session.phase === "connected" ? "already-accepted" : "stale-exchange", `Pairing session ${session.sessionKey} is no longer receiving codes.`);
  	}
  	/** Records what a pairing code turned out to be, for the application to show. */
  	noteRead(session, result, detail) {
  		session.readCount += 1;
  		session.lastRead = result;
  		session.lastReadDetail = detail;
  	}
  	/** Selects the one-based part to display and returns its SVG. */
  	selectPart(sessionKey, oneBasedIndex) {
  		const session = this.requireSession(sessionKey);
  		const total = session.outgoingSvgs.length;
  		if (total === 0) throw new QrPairingError("no-session", "No pairing messages have been prepared yet.");
  		if (!Number.isInteger(oneBasedIndex) || oneBasedIndex < 1 || oneBasedIndex > total) throw new QrPairingError("invalid-argument", `pairing message index must be between 1 and ${total}.`);
  		session.outgoingCurrentIndex = oneBasedIndex - 1;
  		return session.outgoingSvgs[session.outgoingCurrentIndex] ?? "";
  	}
  	/** Advances to the next part, wrapping from the last part to the first. */
  	selectNextPart(sessionKey) {
  		const session = this.requireSession(sessionKey);
  		const total = session.outgoingSvgs.length;
  		if (total === 0) throw new QrPairingError("no-session", "No pairing messages have been prepared yet.");
  		return this.selectPart(sessionKey, (session.outgoingCurrentIndex + 1) % total + 1);
  	}
  	partSvg(sessionKey, oneBasedIndex) {
  		return this.requireSession(sessionKey).outgoingSvgs[oneBasedIndex - 1] ?? "";
  	}
  	/** The outgoing Structured Append sequence, in order. Empty until one is prepared. */
  	outgoingSymbols(sessionKey) {
  		return this.requireSession(sessionKey).outgoing?.symbols ?? [];
  	}
  	/** The whole outgoing message as text, which `ingestQrText` accepts. */
  	messageText(sessionKey) {
  		return this.requireSession(sessionKey).outgoing?.text ?? "";
  	}
  	/** Shows the one-based part on the supplied sprite, keeping its original skin. */
  	showPart(sessionKey, oneBasedIndex, target) {
  		const session = this.requireSession(sessionKey);
  		const svg = this.selectPart(sessionKey, oneBasedIndex);
  		session.displayTargets.add(this.display().show(target, svg));
  	}
  	showNextPart(sessionKey, target) {
  		const session = this.requireSession(sessionKey);
  		const svg = this.selectNextPart(sessionKey);
  		session.displayTargets.add(this.display().show(target, svg));
  	}
  	/** Restores the sprites this session changed. The session itself stays open. */
  	endDisplay(sessionKey) {
  		this.releaseDisplay(this.requireSession(sessionKey));
  	}
  	/** Called when the runtime removes a sprite, so its skin is not restored onto nothing. */
  	handleTargetRemoved(target) {
  		for (const session of this.sessions.values()) {
  			if (!session.displayTargets.delete(target)) continue;
  			this.display().releaseTarget(target);
  		}
  	}
  	/**
  	* Reads parts from a camera until the exchange has everything it needs.
  	*
  	* Codes that belong to something else are skipped rather than reported: a
  	* camera aimed at a projection also sees whatever else is in frame.
  	*/
  	async scanFromCamera(sessionKey, cameraId) {
  		this.requireEnabled();
  		const session = this.requireSession(sessionKey);
  		const camera = cameraId.trim() || "default";
  		if (session.scanAbort) throw new QrPairingError("invalid-argument", `Pairing session ${session.sessionKey} is already scanning.`);
  		const epoch = session.epoch;
  		const abort = new AbortController();
  		session.scanAbort = abort;
  		this.activeScans += 1;
  		const scan = this.scanner();
  		try {
  			while (!this.isStale(session, epoch) && !isTerminalPhase(session.phase)) {
  				if (session.delivered) return;
  				const read = await scan.scanOnce({
  					cameraId: camera,
  					signal: abort.signal
  				});
  				if (this.isStale(session, epoch)) return;
  				try {
  					await this.ingestQrRead(sessionKey, read);
  				} catch (error) {
  					if (!(error instanceof QrPairingError) || !skippableWhileScanning.has(error.code)) throw error;
  				}
  			}
  		} catch (error) {
  			if (error instanceof QrPairingError && error.code === "cancelled") return;
  			throw error;
  		} finally {
  			if (session.scanAbort === abort) session.scanAbort = void 0;
  			this.activeScans -= 1;
  			if (this.activeScans === 0) await scan.release();
  		}
  	}
  	cancelPairing(sessionKey) {
  		const session = this.sessions.get(requireSessionKey(sessionKey));
  		if (!session) return;
  		this.finish(session, "cancelled", "", "");
  	}
  	/** Cancels the current exchange and starts a new one with a fresh exchange ID. */
  	async retryPairing(sessionKey) {
  		this.requireEnabled();
  		const session = this.requireSession(sessionKey);
  		this.finish(session, "cancelled", "", "");
  		this.resetSession(session);
  		if (session.role === "hub") await this.runOfferExchange(session);
  		else {
  			session.phase = "awaiting-offer";
  			this.scheduleTick(session);
  		}
  	}
  	setTimeoutSeconds(sessionKey, seconds) {
  		const session = this.requireSession(sessionKey);
  		if (!Number.isFinite(seconds) || seconds < 1 || seconds > 3600) throw new QrPairingError("invalid-argument", `Pairing timeout must be between 1 and ${MAX_TIMEOUT_SECONDS} seconds.`);
  		session.timeoutMilliseconds = Math.floor(seconds * 1e3);
  	}
  	progress(sessionKey) {
  		const session = this.sessions.get(sessionKey.trim());
  		if (!session) return {
  			phase: this.enabled ? idlePhase : "disabled",
  			role: "hub",
  			sessionKey: sessionKey.trim(),
  			exchangeId: "",
  			localPeerId: "",
  			remotePeerId: "",
  			outgoingPartCount: 0,
  			outgoingCurrentPart: 0,
  			receivedParts: 0,
  			requiredParts: 0,
  			missingParts: [],
  			connectionState: "",
  			errorCode: "",
  			errorMessage: "",
  			remainingSeconds: 0,
  			readCount: 0,
  			lastRead: "",
  			lastReadDetail: ""
  		};
  		const elapsed = this.clock.nowMilliseconds() - session.startedAtMonotonic;
  		const remaining = Math.max(0, session.timeoutMilliseconds - elapsed);
  		return {
  			phase: this.enabled ? session.phase : "disabled",
  			role: session.role,
  			sessionKey: session.sessionKey,
  			exchangeId: session.exchangeId,
  			localPeerId: session.localPeerId,
  			remotePeerId: session.remotePeerId,
  			outgoingPartCount: session.outgoingSvgs.length,
  			outgoingCurrentPart: session.outgoingCurrentIndex + 1,
  			receivedParts: session.assembler.receivedCount(),
  			requiredParts: session.assembler.requiredCount(),
  			missingParts: session.assembler.missingParts().map((index) => index + 1),
  			connectionState: session.peerCreated ? this.readConnectionState(session) : "",
  			errorCode: session.errorCode,
  			errorMessage: session.errorMessage,
  			remainingSeconds: isTerminalPhase(session.phase) ? 0 : Math.ceil(remaining / 1e3),
  			readCount: session.readCount,
  			lastRead: session.lastRead,
  			lastReadDetail: session.lastReadDetail
  		};
  	}
  	sessionKeys() {
  		return [...this.sessions.keys()];
  	}
  	isConnected(sessionKey) {
  		return this.sessions.get(sessionKey.trim())?.phase === "connected";
  	}
  	/** Resolves on connection, rejects on failure, cancellation, or expiry. */
  	waitUntilConnected(sessionKey) {
  		const session = this.requireSession(sessionKey);
  		if (session.phase === "connected") return Promise.resolve();
  		if (isTerminalPhase(session.phase)) return Promise.reject(this.terminalError(session));
  		return new Promise((resolve, reject) => {
  			session.waiters.push({
  				resolve,
  				reject
  			});
  		});
  	}
  	/**
  	* Project run stop. Cancels exchanges in progress and releases what this
  	* controller owns. Established connections stay up: closing them is the
  	* application's explicit decision.
  	*/
  	stopTransient() {
  		for (const session of [...this.sessions.values()]) {
  			if (session.phase === "connected") {
  				this.clearTimer(session);
  				session.scanAbort?.abort();
  				this.releaseDisplay(session);
  				continue;
  			}
  			this.finish(session, "cancelled", "", "");
  		}
  		this.releaseScanner();
  	}
  	/** Runtime disposal. Drops every session and its retained state. */
  	dispose() {
  		for (const session of [...this.sessions.values()]) this.finish(session, "cancelled", "", "");
  		this.sessions.clear();
  		this.lazyDisplay?.releaseAll();
  		this.releaseScanner();
  	}
  	async runOfferExchange(session) {
  		const epoch = session.epoch;
  		session.phase = "creating-offer";
  		this.scheduleTick(session);
  		try {
  			const webrtc = this.webrtc();
  			const created = await webrtc.createOffer(session.remotePeerId);
  			if (this.isStale(session, epoch)) return;
  			session.peerCreated = true;
  			const code = created || webrtc.getOffer(session.remotePeerId);
  			if (!code) throw new QrPairingError("webrtc-rejected", "TurboWarp WebRTC did not return an offer pairing code.");
  			const parts = await createPairingCodes(code, this.codeOptions(session, "offer"));
  			if (this.isStale(session, epoch)) return;
  			this.attachOutgoing(session, parts);
  			session.phase = "offer-ready";
  		} catch (error) {
  			if (!this.isStale(session, epoch)) this.failFrom(session, error);
  			throw error;
  		}
  	}
  	async acceptAnswer(session, message, epoch) {
  		try {
  			await this.webrtc().acceptAnswer(session.remotePeerId, message);
  			if (this.isStale(session, epoch)) return;
  			session.phase = "connecting";
  			this.scheduleTick(session);
  		} catch (error) {
  			if (!this.isStale(session, epoch)) this.failFrom(session, error);
  			throw error;
  		}
  	}
  	async acceptOfferAndPrepareAnswer(session, message, epoch) {
  		session.phase = "creating-answer";
  		try {
  			const webrtc = this.webrtc();
  			const created = await webrtc.acceptOffer(session.remotePeerId, message);
  			if (this.isStale(session, epoch)) return;
  			session.peerCreated = true;
  			const code = created || webrtc.getAnswer(session.remotePeerId);
  			if (!code) throw new QrPairingError("webrtc-rejected", "TurboWarp WebRTC did not return an answer pairing code.");
  			const parts = await createPairingCodes(code, this.codeOptions(session, "answer"));
  			if (this.isStale(session, epoch)) return;
  			this.attachOutgoing(session, parts);
  			session.phase = "answer-ready";
  			this.scheduleTick(session);
  		} catch (error) {
  			if (!this.isStale(session, epoch)) this.failFrom(session, error);
  			throw error;
  		}
  	}
  	codeOptions(session, kind) {
  		const common = {
  			senderPeerId: session.localPeerId,
  			targetPeerId: session.remotePeerId,
  			errorCorrectionLevel: this.errorCorrectionLevel,
  			maxVersion: kind === "offer" ? this.offerMaxVersion : this.answerMaxVersion,
  			createdAt: this.now()
  		};
  		return kind === "offer" ? {
  			...common,
  			kind
  		} : {
  			...common,
  			kind,
  			sessionId: session.exchangeId,
  			replyTo: session.incomingMessageId
  		};
  	}
  	attachOutgoing(session, parts) {
  		session.outgoing = parts;
  		session.outgoingSvgs = parts.svgs;
  		session.outgoingCurrentIndex = -1;
  		session.exchangeId = parts.sessionId;
  		session.outgoingMessageId = parts.messageId;
  	}
  	/**
  	* Checks that a message belongs to this exchange, this role, and this peer
  	* pair before its pairing code reaches WebRTC.
  	*/
  	verifyHeader(session, header) {
  		const expectedKind = session.role === "hub" ? "answer" : "offer";
  		if (header.kind !== expectedKind) throw new QrPairingError("unexpected-kind", `This session expects an ${expectedKind}.`);
  		if (session.role === "hub") {
  			if (header.sessionId !== session.exchangeId) throw new QrPairingError("stale-exchange", "Pairing message belongs to a different pairing exchange.");
  			if (header.replyTo !== session.outgoingMessageId) throw new QrPairingError("reply-mismatch", "Pairing message answers a different offer.");
  			if (header.senderPeerId !== session.remotePeerId || header.targetPeerId !== session.localPeerId) throw new QrPairingError("peer-mismatch", "Pairing message names a different pair of peers.");
  			return;
  		}
  		if (session.exchangeId !== "" && header.sessionId !== session.exchangeId) throw new QrPairingError("stale-exchange", "Pairing message belongs to a different pairing exchange.");
  		if (session.expectedLocalPeerId !== "" && header.targetPeerId !== session.expectedLocalPeerId) throw new QrPairingError("peer-mismatch", "Pairing message is addressed to a different device.");
  		if (session.remotePeerId !== "" && header.senderPeerId !== session.remotePeerId) throw new QrPairingError("peer-mismatch", "Pairing message names a different sender.");
  	}
  	/**
  	* Adopts the peer naming the offer carries. The sender's name for itself
  	* becomes this device's WebRTC peer key, so the two ends never need to be
  	* configured with the same identifiers.
  	*/
  	adoptOffer(session, header) {
  		session.exchangeId = header.sessionId;
  		session.localPeerId = header.targetPeerId;
  		session.remotePeerId = header.senderPeerId;
  	}
  	createSession(input) {
  		return {
  			sessionKey: input.sessionKey,
  			role: input.role,
  			expectedLocalPeerId: input.expectedLocalPeerId,
  			localPeerId: input.localPeerId,
  			remotePeerId: input.remotePeerId,
  			phase: idlePhase,
  			epoch: 0,
  			exchangeId: "",
  			outgoingMessageId: "",
  			incomingMessageId: "",
  			outgoing: void 0,
  			outgoingSvgs: [],
  			outgoingCurrentIndex: -1,
  			assembler: new PairingAssembler(),
  			candidate: new PairingAssembler(),
  			readQueue: Promise.resolve(),
  			delivered: false,
  			peerCreated: false,
  			timeoutMilliseconds: 6e5,
  			startedAtMonotonic: this.clock.nowMilliseconds(),
  			errorCode: "",
  			errorMessage: "",
  			tickTimer: void 0,
  			displayTargets: /* @__PURE__ */ new Set(),
  			scanAbort: void 0,
  			waiters: [],
  			readCount: 0,
  			lastRead: "",
  			lastReadDetail: ""
  		};
  	}
  	/** Prepares an existing session entry for a new exchange after a retry. */
  	resetSession(session) {
  		session.epoch += 1;
  		session.phase = idlePhase;
  		session.exchangeId = "";
  		session.outgoingMessageId = "";
  		session.incomingMessageId = "";
  		session.outgoing = void 0;
  		session.outgoingSvgs = [];
  		session.outgoingCurrentIndex = -1;
  		session.assembler = new PairingAssembler();
  		session.candidate = new PairingAssembler();
  		session.delivered = false;
  		session.peerCreated = false;
  		session.startedAtMonotonic = this.clock.nowMilliseconds();
  		session.errorCode = "";
  		session.errorMessage = "";
  		session.scanAbort = void 0;
  		session.readCount = 0;
  		session.lastRead = "";
  		session.lastReadDetail = "";
  		if (session.role === "camera") {
  			session.localPeerId = session.expectedLocalPeerId;
  			session.remotePeerId = "";
  		}
  	}
  	scheduleTick(session) {
  		if (session.tickTimer !== void 0) return;
  		session.tickTimer = setTimeout(() => {
  			session.tickTimer = void 0;
  			this.tick(session);
  		}, 250);
  	}
  	tick(session) {
  		if (this.sessions.get(session.sessionKey) !== session) return;
  		if (isTerminalPhase(session.phase)) return;
  		if (this.clock.nowMilliseconds() - session.startedAtMonotonic >= session.timeoutMilliseconds) {
  			this.finish(session, "expired", "timeout", "The pairing exchange timed out.");
  			return;
  		}
  		if (session.peerCreated) {
  			const state = this.readConnectionState(session);
  			if (state === "connected") {
  				this.finish(session, "connected", "", "");
  				return;
  			}
  			if (state === "failed" || state === "closed") {
  				this.finish(session, "failed", "webrtc-rejected", "WebRTC reported that the connection could not be established.");
  				return;
  			}
  		}
  		this.scheduleTick(session);
  	}
  	/**
  	* Moves a session to a terminal phase and releases what it owns.
  	*
  	* Everything but an established RTCPeerConnection is released: timers, the
  	* QR codes sent and received, and the peer connection when it never connected.
  	*/
  	finish(session, phase, errorCode, errorMessage) {
  		if (isTerminalPhase(session.phase) && session.phase !== "connected") return;
  		const connected = phase === "connected";
  		session.epoch += 1;
  		session.phase = phase;
  		session.errorCode = errorCode;
  		session.errorMessage = errorMessage;
  		this.clearTimer(session);
  		session.scanAbort?.abort();
  		this.releaseDisplay(session);
  		this.dropCodes(session);
  		if (!connected) {
  			if (session.peerCreated) {
  				try {
  					this.webrtc().closePeer(session.remotePeerId);
  				} catch {}
  				session.peerCreated = false;
  			}
  		}
  		const waiters = session.waiters.splice(0, session.waiters.length);
  		for (const waiter of waiters) if (connected) waiter.resolve();
  		else waiter.reject(this.terminalError(session));
  	}
  	/** Forgets the codes this session made and the codes it received. */
  	dropCodes(session) {
  		session.outgoing = void 0;
  		session.outgoingSvgs = [];
  		session.outgoingCurrentIndex = -1;
  		session.assembler.clear();
  		session.candidate.clear();
  	}
  	failFrom(session, error) {
  		const code = error instanceof QrPairingError ? error.code : "webrtc-rejected";
  		const message = error instanceof Error ? error.message : "Pairing failed.";
  		this.finish(session, "failed", code, message);
  	}
  	terminalError(session) {
  		if (session.phase === "cancelled") return new QrPairingError("cancelled", "The pairing exchange was cancelled.");
  		if (session.phase === "expired") return new QrPairingError("timeout", "The pairing exchange timed out.");
  		return new QrPairingError(session.errorCode === "" ? "webrtc-rejected" : session.errorCode, session.errorMessage || "The pairing exchange failed.");
  	}
  	clearTimer(session) {
  		if (session.tickTimer === void 0) return;
  		clearTimeout(session.tickTimer);
  		session.tickTimer = void 0;
  	}
  	readConnectionState(session) {
  		try {
  			return this.webrtc().connectionState(session.remotePeerId);
  		} catch {
  			return "";
  		}
  	}
  	async releaseScanner() {
  		if (this.activeScans > 0) return;
  		await this.lazyScan?.release();
  	}
  	releaseDisplay(session) {
  		if (session.displayTargets.size === 0) return;
  		const display = this.display();
  		for (const target of [...session.displayTargets]) display.releaseTarget(target);
  		session.displayTargets.clear();
  	}
  	webrtc() {
  		return this.injectedWebRtc ?? requireWebRtcPairingPort(this.runtime);
  	}
  	display() {
  		this.lazyDisplay ?? (this.lazyDisplay = this.injectedDisplay ?? new TemporarySpriteSkinManager(this.runtime));
  		return this.lazyDisplay;
  	}
  	scanner() {
  		this.lazyScan ?? (this.lazyScan = this.injectedScan ?? new CameraQrScanner(this.runtime, "webrtc-qrcode-pairing"));
  		return this.lazyScan;
  	}
  	requireEnabled() {
  		if (this.enabled) return;
  		throw new QrPairingError("feature-disabled", "QR code pairing is disabled. Enable it before the project starts.");
  	}
  	requireCapacity() {
  		if (this.sessions.size < 8) return;
  		throw new QrPairingError("session-limit", `At most 8 pairing sessions can be open at once.`);
  	}
  	requireSession(sessionKey) {
  		const session = this.sessions.get(requireSessionKey(sessionKey));
  		if (!session) throw new QrPairingError("no-session", `Pairing session ${sessionKey.trim()} is not open.`);
  		return session;
  	}
  	isStale(session, epoch) {
  		return session.epoch !== epoch || this.sessions.get(session.sessionKey) !== session;
  	}
  };
  function requireSessionKey(value) {
  	const key = typeof value === "string" ? value.trim() : "";
  	if (key === "") throw new QrPairingError("invalid-argument", "Pairing session name must not be empty.");
  	return key;
  }
  /** The error code a failure carries, for reporting why a code was ignored. */
  function codeOf(error) {
  	return error instanceof QrPairingError ? error.code : "invalid-envelope";
  }
  function alreadyAccepted() {
  	return new QrPairingError("already-accepted", "The pairing code for this exchange has already been accepted.");
  }
  /** Whether a failure is about a pairing code, rather than about text that is not one at all. */
  function isReported(error) {
  	return !(error instanceof QrPairingError && unreportedCodes.has(error.code));
  }
  //#endregion
  //#region src/extension.ts
  var blockDefinitions = block_definitions_default.blocks;
  /**
  * Block facade.
  *
  * Every method casts its arguments and delegates. Pairing logic lives in
  * PairingController, which has no Scratch dependency and can be tested without
  * a runtime.
  */
  var WebRtcQrCodePairingExtension = class {
  	constructor(options = {}) {
  		this.stopListener = () => this.pairing.stopTransient();
  		this.resetListener = () => this.pairing.dispose();
  		this.disposeListener = () => this.dispose();
  		this.targetRemovedListener = (target) => {
  			if (isTarget(target)) this.pairing.handleTargetRemoved(target);
  		};
  		this.enabled = options.enabled ?? featureFlags.qrCodePairing;
  		this.runtime = options.runtime ?? Scratch.vm?.runtime ?? {};
  		this.pairing = new PairingController({
  			...options,
  			runtime: this.runtime
  		});
  		this.runtime.on?.("PROJECT_RUN_STOP", this.stopListener);
  		this.runtime.on?.("PROJECT_STOP_ALL", this.stopListener);
  		this.runtime.on?.("PROJECT_LOADED", this.resetListener);
  		this.runtime.on?.("RUNTIME_DISPOSED", this.disposeListener);
  		this.runtime.on?.("targetWasRemoved", this.targetRemovedListener);
  	}
  	getInfo() {
  		return {
  			id: extensionConfig.id,
  			name: Scratch.translate(block_definitions_default.extensionName),
  			docsURI: extensionConfig.docsURI,
  			blockIconURI: extensionConfig.blockIconURI,
  			blocks: this.enabled ? blockDefinitions.map((block) => this.toScratchBlock(block)) : []
  		};
  	}
  	async startOfferPairing(args) {
  		await this.pairing.startOfferPairing({
  			sessionKey: Scratch.Cast.toString(args.SESSION),
  			localPeerId: Scratch.Cast.toString(args.LOCAL_PEER),
  			remotePeerId: Scratch.Cast.toString(args.REMOTE_PEER)
  		});
  	}
  	startAnswerPairing(args) {
  		this.pairing.startAnswerPairing({
  			sessionKey: Scratch.Cast.toString(args.SESSION),
  			expectedLocalPeerId: Scratch.Cast.toString(args.LOCAL_PEER)
  		});
  	}
  	async ingestPairingQrText(args) {
  		await this.pairing.ingestQrText(Scratch.Cast.toString(args.SESSION), Scratch.Cast.toString(args.TEXT));
  	}
  	async scanPairingQrFromCamera(args) {
  		await this.pairing.scanFromCamera(Scratch.Cast.toString(args.SESSION), Scratch.Cast.toString(args.CAMERA_ID));
  	}
  	pairingReceivedParts(args) {
  		return this.progress(args).receivedParts;
  	}
  	pairingRequiredParts(args) {
  		return this.progress(args).requiredParts;
  	}
  	pairingMissingParts(args) {
  		return this.progress(args).missingParts.join(",");
  	}
  	pairingReadCount(args) {
  		return this.progress(args).readCount;
  	}
  	pairingLastRead(args) {
  		return this.progress(args).lastRead;
  	}
  	pairingLastReadDetail(args) {
  		return this.progress(args).lastReadDetail;
  	}
  	showPairingQrPart(args, util) {
  		this.pairing.showPart(Scratch.Cast.toString(args.SESSION), Scratch.Cast.toNumber(args.INDEX), util?.target);
  	}
  	showNextPairingQrPart(args, util) {
  		this.pairing.showNextPart(Scratch.Cast.toString(args.SESSION), util?.target);
  	}
  	pairingQrPartCount(args) {
  		return this.progress(args).outgoingPartCount;
  	}
  	pairingQrCurrentPart(args) {
  		return this.progress(args).outgoingCurrentPart;
  	}
  	pairingQrPartSvg(args) {
  		return this.partSvg(args);
  	}
  	pairingQrPartDataUri(args) {
  		const svg = this.partSvg(args);
  		return svg === "" ? "" : `data:image/svg+xml;base64,${btoa(svg)}`;
  	}
  	endPairingQrDisplay(args) {
  		this.pairing.endDisplay(Scratch.Cast.toString(args.SESSION));
  	}
  	pairingPhase(args) {
  		return this.progress(args).phase;
  	}
  	pairingConnectionState(args) {
  		return this.progress(args).connectionState;
  	}
  	isPairingConnected(args) {
  		return this.pairing.isConnected(Scratch.Cast.toString(args.SESSION));
  	}
  	async waitUntilPairingConnected(args) {
  		await this.pairing.waitUntilConnected(Scratch.Cast.toString(args.SESSION));
  	}
  	pairingError(args) {
  		return this.progress(args).errorCode;
  	}
  	pairingErrorMessage(args) {
  		return this.progress(args).errorMessage;
  	}
  	pairingLocalPeer(args) {
  		return this.progress(args).localPeerId;
  	}
  	pairingRemotePeer(args) {
  		return this.progress(args).remotePeerId;
  	}
  	pairingExchangeId(args) {
  		return this.progress(args).exchangeId;
  	}
  	pairingRemainingSeconds(args) {
  		return this.progress(args).remainingSeconds;
  	}
  	pairingSessions() {
  		return this.pairing.sessionKeys().join(",");
  	}
  	cancelPairing(args) {
  		this.pairing.cancelPairing(Scratch.Cast.toString(args.SESSION));
  	}
  	async retryPairing(args) {
  		await this.pairing.retryPairing(Scratch.Cast.toString(args.SESSION));
  	}
  	setPairingTimeout(args) {
  		this.pairing.setTimeoutSeconds(Scratch.Cast.toString(args.SESSION), Scratch.Cast.toNumber(args.SECONDS));
  	}
  	dispose() {
  		this.pairing.dispose();
  		this.runtime.off?.("PROJECT_RUN_STOP", this.stopListener);
  		this.runtime.off?.("PROJECT_STOP_ALL", this.stopListener);
  		this.runtime.off?.("PROJECT_LOADED", this.resetListener);
  		this.runtime.off?.("RUNTIME_DISPOSED", this.disposeListener);
  		this.runtime.off?.("targetWasRemoved", this.targetRemovedListener);
  	}
  	progress(args) {
  		return this.pairing.progress(Scratch.Cast.toString(args.SESSION));
  	}
  	/** Reporters report; they never stop a script, so an unknown session is an empty string. */
  	partSvg(args) {
  		try {
  			return this.pairing.partSvg(Scratch.Cast.toString(args.SESSION), Scratch.Cast.toNumber(args.INDEX));
  		} catch {
  			return "";
  		}
  	}
  	toScratchBlock(block) {
  		return {
  			opcode: block.opcode,
  			blockType: Scratch.BlockType[block.blockType],
  			text: Scratch.translate(block.text),
  			arguments: Object.fromEntries(Object.entries(block.arguments).map(([name, argument]) => [name, {
  				type: Scratch.ArgumentType[argument.type],
  				defaultValue: argument.defaultValue
  			}]))
  		};
  	}
  };
  function isTarget(value) {
  	return typeof value === "object" && value !== null;
  }
  //#endregion
  //#region src/index.ts
  if (extensionConfig.unsandboxed && !Scratch.extensions.unsandboxed) throw new Error(`${extensionConfig.name} must run unsandboxed.`);
  Scratch.extensions.register(new WebRtcQrCodePairingExtension());
  //#endregion

})(Scratch);
