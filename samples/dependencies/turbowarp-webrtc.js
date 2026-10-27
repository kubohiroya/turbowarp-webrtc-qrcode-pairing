// Name: WebRTC Manual Pairing
// ID: kubohiroyawebrtc
// Description: Peer-to-peer DataChannel messaging for TurboWarp with manual pairing codes.
// By: Hiroya Kubo
// License: MPL-2.0

(function (Scratch) {
  'use strict';

//#region src/config.ts
var extensionConfig = {
	id: "kubohiroyawebrtc",
	slug: "turbowarp-webrtc",
	name: "WebRTC Manual Pairing",
	description: "Peer-to-peer DataChannel messaging for TurboWarp with manual pairing codes.",
	author: "Hiroya Kubo",
	license: "MPL-2.0",
	unsandboxed: true,
	blockIconURI: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PGNpcmNsZSBjeD0iMTIiIGN5PSIyNCIgcj0iNiIgZmlsbD0iIzRDOTdGRiIvPjxjaXJjbGUgY3g9IjM2IiBjeT0iMjQiIHI9IjYiIGZpbGw9IiM0Qzk3RkYiLz48cGF0aCBkPSJNMTggMjRoMTIiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzU5QzA1OSIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48cGF0aCBkPSJNMjQgMTlsNSA1LTUgNS01LTV6IiBmaWxsPSIjNTlDMDU5Ii8+PC9zdmc+"
};
var block_editor_fixed_inputs_schema_default = {
	$schema: "http://json-schema.org/draft-07/schema#",
	$id: "https://kubohiroya.github.io/turbowarp-webrtc/schemas/block-editor-fixed-inputs.schema.json",
	title: "turbowarp-webrtc fixed editing contracts",
	$defs: {
		"setIceMode": {
			"type": "object",
			"properties": { "MODE": {
				"type": "string",
				"enum": ["lan", "stun"]
			} },
			"additionalProperties": false
		},
		"configureLatestDataChannel": {
			"type": "object",
			"properties": { "HIGH_WATER_MARK": { "type": "number" } },
			"additionalProperties": false
		},
		"requireRuntimeCapabilityVersion": {
			"type": "object",
			"properties": { "VERSION": {
				"type": "number",
				"enum": [
					1,
					2,
					3
				]
			} },
			"additionalProperties": false
		},
		"frameLatency": {
			"type": "object",
			"properties": {
				"CAPTURE_US": { "type": "number" },
				"PATTERN_US": { "type": "number" },
				"WRAP_US": { "type": "number" }
			},
			"additionalProperties": false
		},
		"recordFrameSyncSample": {
			"type": "object",
			"properties": {
				"CAPTURE_US": { "type": "number" },
				"PATTERN_US": { "type": "number" },
				"WRAP_US": { "type": "number" }
			},
			"additionalProperties": false
		}
	}
};
//#endregion
//#region src/fixed-input-editors.ts
var contracts = block_editor_fixed_inputs_schema_default.$defs;
var repository = "turbowarp-webrtc";
var extensionId = "kubohiroyawebrtc";
var token = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u;
function readNumber(value) {
	if (typeof value !== "string" && typeof value !== "number") throw new TypeError("Invalid numeric projection.");
	if (typeof value === "string" && value.trim() === "") throw new TypeError("Existing blank field is readonly.");
	const number = Number(value);
	if (!Number.isFinite(number)) throw new TypeError("Existing nonfinite field is readonly.");
	return number;
}
function newNumberToken(value) {
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new TypeError("Invalid new number.");
		return Object.is(value, -0) ? "-0" : String(value);
	}
	if (typeof value !== "string" || !token.test(value.trim()) || !Number.isFinite(Number(value))) throw new TypeError("Invalid new number.");
	return value.trim();
}
function existingChoice(opcode, value) {
	if (typeof value !== "string") throw new TypeError("Invalid string projection.");
	if (opcode === "setIceMode") {
		const normalized = value.trim().toLowerCase();
		if (normalized === "lan" || normalized === "stun") return normalized;
	}
	return value;
}
function candidateValid(_opcode, _argument, schema, value) {
	if (schema.type === "number" || schema.type === "integer") {
		let number;
		try {
			number = readNumber(value);
		} catch {
			return false;
		}
		if (schema.type === "integer" && !Number.isInteger(number)) return false;
		if (schema.minimum !== void 0 && number < schema.minimum) return false;
		if (schema.maximum !== void 0 && number > schema.maximum) return false;
		if (schema.exclusiveMinimum !== void 0 && number <= schema.exclusiveMinimum) return false;
		if (schema.enum && !schema.enum.includes(number)) return false;
		return true;
	}
	return typeof value === "string" && schema.enum.includes(value);
}
function fixedInputEditorOptions() {
	return Object.entries(contracts).map(([opcode, contract]) => ({
		apiVersion: 1,
		extensionId,
		editorId: `${extensionId}.fixed.${opcode}`,
		opcodes: [`${extensionId}_${opcode}`],
		contractId: `${repository}.${opcode}.fixed`,
		contractRevision: "fixed-inputs-v1",
		validationContext: () => ({
			consumerId: repository,
			nowMs: 0,
			settings: null
		}),
		bindings: Object.entries(contract.properties).map(([argument, schema]) => {
			const numeric = schema.type === "number" || schema.type === "integer";
			const source = {
				repository,
				path: "schemas/block-editor-fixed-inputs.schema.json",
				symbol: `/$defs/${opcode}/properties/${argument}`
			};
			return {
				argument,
				schemaBundle: {
					identity: {
						ownerId: repository,
						contractId: `${opcode}.${argument}`,
						revision: "fixed-inputs-v1",
						variantId: "fixed"
					},
					dialect: "draft-07",
					root: {
						retrievalUri: `${block_editor_fixed_inputs_schema_default.$id}?binding=${opcode}.${argument}`,
						document: schema,
						artifact: {
							role: "canonical-schema",
							source
						}
					},
					resources: [],
					provenance: {
						canonicalSources: [
							source,
							{
								repository,
								path: "src/block-definitions.json"
							},
							{
								repository,
								path: "src/extension.ts",
								symbol: opcode
							}
						],
						generatedFiles: [],
						referenceSchemas: [],
						generationSources: []
					}
				},
				control: numeric ? { kind: "number" } : {
					kind: "enum",
					choices: schema.enum.map((value) => ({
						value,
						label: String(value)
					}))
				},
				read: (value) => numeric ? readNumber(value) : existingChoice(opcode, value),
				encode: (value) => {
					if (numeric) return newNumberToken(value);
					if (typeof value !== "string" || !schema.enum.includes(value)) throw new TypeError("Invalid new enum value.");
					return value;
				},
				validateCandidate: (value) => candidateValid(opcode, argument, schema, value) ? [] : [{
					path: argument,
					message: "Check this value before saving."
				}]
			};
		})
	}));
}
/** Register only visible static contracts; ordinary composition consumers load no editor runtime. */
function registerFixedInputEditors(scratch, runtime, visibleBlocks) {
	const api = scratch.gui?.blockEditors;
	if (api?.apiVersion !== 1 || typeof api.registerFixedInputEditor !== "function") return void 0;
	const visibleOpcodes = new Set(visibleBlocks.flatMap((block) => {
		if (typeof block !== "object" || block === null || !("opcode" in block)) return [];
		return typeof block.opcode === "string" ? [block.opcode] : [];
	}));
	const events = runtime;
	const removers = [];
	let active = true;
	const dispose = () => {
		if (!active) return;
		active = false;
		events?.off?.("RUNTIME_DISPOSED", dispose);
		for (const remove of removers.splice(0).reverse()) remove();
	};
	try {
		for (const options of fixedInputEditorOptions()) if (options.opcodes.some((opcode) => visibleOpcodes.has(opcode.slice(17)))) removers.push(api.registerFixedInputEditor.call(api, options));
		events?.on?.("RUNTIME_DISPOSED", dispose);
	} catch (error) {
		dispose();
		throw error;
	}
	return dispose;
}
var block_definitions_default = {
	extensionName: "WebRTC Manual Pairing",
	blocks: [
		{
			"opcode": "setIceMode",
			"blockType": "COMMAND",
			"text": "set ICE mode [MODE]",
			"description": "Sets whether new peer connections use LAN-only ICE or public STUN servers.",
			"arguments": { "MODE": {
				"type": "STRING",
				"defaultValue": "lan"
			} }
		},
		{
			"opcode": "createOffer",
			"blockType": "COMMAND",
			"text": "create offer code for peer [PEER]",
			"description": "Creates a manual pairing offer code for the named peer.",
			"arguments": { "PEER": {
				"type": "STRING",
				"defaultValue": "peer-a"
			} }
		},
		{
			"opcode": "getOffer",
			"blockType": "REPORTER",
			"text": "offer code for peer [PEER]",
			"description": "Returns the latest offer code generated for the named peer.",
			"arguments": { "PEER": {
				"type": "STRING",
				"defaultValue": "peer-a"
			} }
		},
		{
			"opcode": "acceptOffer",
			"blockType": "COMMAND",
			"text": "accept offer code [CODE] as peer [PEER]",
			"description": "Accepts a peer's offer code and creates an answer code.",
			"arguments": {
				"CODE": {
					"type": "STRING",
					"defaultValue": "offer-code"
				},
				"PEER": {
					"type": "STRING",
					"defaultValue": "peer-a"
				}
			}
		},
		{
			"opcode": "getAnswer",
			"blockType": "REPORTER",
			"text": "answer code for peer [PEER]",
			"description": "Returns the latest answer code generated for the named peer.",
			"arguments": { "PEER": {
				"type": "STRING",
				"defaultValue": "peer-a"
			} }
		},
		{
			"opcode": "acceptAnswer",
			"blockType": "COMMAND",
			"text": "accept answer code [CODE] for peer [PEER]",
			"description": "Completes pairing by accepting a peer's answer code.",
			"arguments": {
				"CODE": {
					"type": "STRING",
					"defaultValue": "answer-code"
				},
				"PEER": {
					"type": "STRING",
					"defaultValue": "peer-a"
				}
			}
		},
		{
			"opcode": "sendEvent",
			"blockType": "COMMAND",
			"text": "send event [TYPE] payload [PAYLOAD] channel [CHANNEL] to peer [PEER]",
			"description": "Sends a JSON event envelope to one peer, or to all peers when PEER is *.",
			"arguments": {
				"TYPE": {
					"type": "STRING",
					"defaultValue": "door-open"
				},
				"PAYLOAD": {
					"type": "STRING",
					"defaultValue": "{}"
				},
				"CHANNEL": {
					"type": "STRING",
					"defaultValue": "default"
				},
				"PEER": {
					"type": "STRING",
					"defaultValue": "*"
				}
			}
		},
		{
			"opcode": "setLatestDataEnabled",
			"blockType": "COMMAND",
			"text": "set latest-data channels enabled [ENABLED]",
			"description": "Opts in or out of unreliable latest-data channels. The default is disabled.",
			"arguments": { "ENABLED": {
				"type": "BOOLEAN",
				"defaultValue": false
			} }
		},
		{
			"opcode": "configureLatestDataChannel",
			"blockType": "COMMAND",
			"text": "configure latest-data channel [CHANNEL] high-water mark [HIGH_WATER_MARK] bytes for peer [PEER]",
			"description": "Configures a named latest-data channel before creating an offer.",
			"arguments": {
				"CHANNEL": {
					"type": "STRING",
					"defaultValue": "pose"
				},
				"HIGH_WATER_MARK": {
					"type": "NUMBER",
					"defaultValue": 262144
				},
				"PEER": {
					"type": "STRING",
					"defaultValue": "peer-a"
				}
			}
		},
		{
			"opcode": "sendLatestData",
			"blockType": "COMMAND",
			"text": "send latest data [PAYLOAD] channel [CHANNEL] to peer [PEER]",
			"description": "Sends without waiting, or drops the new value when bufferedAmount exceeds the high-water mark.",
			"arguments": {
				"PAYLOAD": {
					"type": "STRING",
					"defaultValue": "{}"
				},
				"CHANNEL": {
					"type": "STRING",
					"defaultValue": "pose"
				},
				"PEER": {
					"type": "STRING",
					"defaultValue": "peer-a"
				}
			}
		},
		{
			"opcode": "latestDataBufferedAmount",
			"blockType": "REPORTER",
			"text": "latest-data buffered bytes for channel [CHANNEL] peer [PEER]",
			"description": "Returns the browser DataChannel bufferedAmount for a named latest-data channel.",
			"arguments": {
				"CHANNEL": {
					"type": "STRING",
					"defaultValue": "pose"
				},
				"PEER": {
					"type": "STRING",
					"defaultValue": "peer-a"
				}
			}
		},
		{
			"opcode": "latestDataSentCount",
			"blockType": "REPORTER",
			"text": "latest-data sent count for channel [CHANNEL] peer [PEER]",
			"description": "Returns the number of values handed to the named latest-data channel.",
			"arguments": {
				"CHANNEL": {
					"type": "STRING",
					"defaultValue": "pose"
				},
				"PEER": {
					"type": "STRING",
					"defaultValue": "peer-a"
				}
			}
		},
		{
			"opcode": "latestDataDroppedCount",
			"blockType": "REPORTER",
			"text": "latest-data dropped count for channel [CHANNEL] peer [PEER]",
			"description": "Returns the number of new values dropped by backpressure.",
			"arguments": {
				"CHANNEL": {
					"type": "STRING",
					"defaultValue": "pose"
				},
				"PEER": {
					"type": "STRING",
					"defaultValue": "peer-a"
				}
			}
		},
		{
			"opcode": "latestDataChannelState",
			"blockType": "REPORTER",
			"text": "latest-data state for channel [CHANNEL] peer [PEER]",
			"description": "Returns disabled, not-configured, connecting, open, closing, or closed.",
			"arguments": {
				"CHANNEL": {
					"type": "STRING",
					"defaultValue": "pose"
				},
				"PEER": {
					"type": "STRING",
					"defaultValue": "peer-a"
				}
			}
		},
		{
			"opcode": "latestDataDropPolicy",
			"blockType": "REPORTER",
			"text": "latest-data drop policy",
			"description": "Returns the fixed backpressure policy, drop-newest.",
			"arguments": {}
		},
		{
			"opcode": "runtimeCapabilityVersion",
			"blockType": "REPORTER",
			"text": "WebRTC runtime capability version",
			"description": "Returns the version of the runtime API for composite extensions.",
			"arguments": {}
		},
		{
			"opcode": "requireRuntimeCapabilityVersion",
			"blockType": "COMMAND",
			"text": "require WebRTC runtime capability version [VERSION]",
			"description": "Throws an explicit error when the requested runtime API version is unsupported.",
			"arguments": { "VERSION": {
				"type": "NUMBER",
				"defaultValue": 2
			} }
		},
		{
			"opcode": "broadcastNetworkMessage",
			"blockType": "COMMAND",
			"text": "broadcast network message [MESSAGE] payload [PAYLOAD] channel [CHANNEL] to peer [PEER]",
			"description": "Sends a network broadcast message envelope to one peer, or to all peers when PEER is *.",
			"arguments": {
				"MESSAGE": {
					"type": "STRING",
					"defaultValue": "door-open"
				},
				"PAYLOAD": {
					"type": "STRING",
					"defaultValue": "{}"
				},
				"CHANNEL": {
					"type": "STRING",
					"defaultValue": "default"
				},
				"PEER": {
					"type": "STRING",
					"defaultValue": "*"
				}
			}
		},
		{
			"opcode": "whenReceiveNetworkMessage",
			"blockType": "EVENT",
			"text": "when I receive network message [MESSAGE]",
			"description": "Starts scripts when a matching network broadcast message is received.",
			"isEdgeActivated": false,
			"arguments": { "MESSAGE": {
				"type": "STRING",
				"defaultValue": "door-open",
				"menu": "networkMessages"
			} }
		},
		{
			"opcode": "networkMessagePayload",
			"blockType": "REPORTER",
			"text": "network message payload",
			"description": "Returns the payload of the most recently received network broadcast message as JSON.",
			"arguments": {}
		},
		{
			"opcode": "networkMessageSender",
			"blockType": "REPORTER",
			"text": "network message sender",
			"description": "Returns the sender ID of the most recently received network broadcast message.",
			"arguments": {}
		},
		{
			"opcode": "networkMessagePeer",
			"blockType": "REPORTER",
			"text": "network message peer",
			"description": "Returns the local peer name that received the most recent network broadcast message.",
			"arguments": {}
		},
		{
			"opcode": "networkMessageChannel",
			"blockType": "REPORTER",
			"text": "network message channel",
			"description": "Returns the channel of the most recently received network broadcast message.",
			"arguments": {}
		},
		{
			"opcode": "hasMessages",
			"blockType": "BOOLEAN",
			"text": "has received messages?",
			"description": "Reports whether the receive queue contains at least one message.",
			"arguments": {}
		},
		{
			"opcode": "messageCount",
			"blockType": "REPORTER",
			"text": "received message count",
			"description": "Returns the number of messages currently waiting in the receive queue.",
			"arguments": {}
		},
		{
			"opcode": "nextMessage",
			"blockType": "REPORTER",
			"text": "next received message",
			"description": "Removes and returns the oldest received message as JSON.",
			"arguments": {}
		},
		{
			"opcode": "lastMessage",
			"blockType": "REPORTER",
			"text": "last received message",
			"description": "Returns the most recent received message as JSON without removing it.",
			"arguments": {}
		},
		{
			"opcode": "clearMessages",
			"blockType": "COMMAND",
			"text": "clear received messages",
			"description": "Clears the receive queue.",
			"arguments": {}
		},
		{
			"opcode": "connectionState",
			"blockType": "REPORTER",
			"text": "connection state of peer [PEER]",
			"description": "Returns the WebRTC connection state for the named peer.",
			"arguments": { "PEER": {
				"type": "STRING",
				"defaultValue": "peer-a"
			} }
		},
		{
			"opcode": "connectedPeers",
			"blockType": "REPORTER",
			"text": "connected peers",
			"description": "Returns a JSON array of connected peer names.",
			"arguments": {}
		},
		{
			"opcode": "closePeer",
			"blockType": "COMMAND",
			"text": "close peer [PEER]",
			"description": "Closes and removes a peer connection.",
			"arguments": { "PEER": {
				"type": "STRING",
				"defaultValue": "peer-a"
			} }
		},
		{
			"opcode": "syncClock",
			"blockType": "COMMAND",
			"text": "sync clock with peer [PEER]",
			"description": "Runs a clock probe exchange with the peer and stores the resulting clock offset.",
			"arguments": { "PEER": {
				"type": "STRING",
				"defaultValue": "peer-a"
			} }
		},
		{
			"opcode": "clockOffset",
			"blockType": "REPORTER",
			"text": "clock offset to peer [PEER] us",
			"description": "Returns the microseconds to add to a local timestamp to express it in the peer's clock.",
			"arguments": { "PEER": {
				"type": "STRING",
				"defaultValue": "peer-a"
			} }
		},
		{
			"opcode": "clockRoundTrip",
			"blockType": "REPORTER",
			"text": "clock round trip to peer [PEER] us",
			"description": "Returns the shortest round trip observed while probing the peer, in microseconds.",
			"arguments": { "PEER": {
				"type": "STRING",
				"defaultValue": "peer-a"
			} }
		},
		{
			"opcode": "clockUncertainty",
			"blockType": "REPORTER",
			"text": "clock uncertainty to peer [PEER] us",
			"description": "Returns the clock offset uncertainty for the peer in microseconds, which is half the shortest round trip.",
			"arguments": { "PEER": {
				"type": "STRING",
				"defaultValue": "peer-a"
			} }
		},
		{
			"opcode": "peerTime",
			"blockType": "REPORTER",
			"text": "time in clock of peer [PEER] us",
			"description": "Returns the current local time expressed in the peer's clock, in microseconds. Errors when the peer clock has not been probed yet.",
			"arguments": { "PEER": {
				"type": "STRING",
				"defaultValue": "peer-a"
			} }
		},
		{
			"opcode": "localTime",
			"blockType": "REPORTER",
			"text": "local time us",
			"description": "Returns the local high-resolution clock in microseconds.",
			"arguments": {}
		},
		{
			"opcode": "frameLatency",
			"blockType": "REPORTER",
			"text": "frame latency us for capture [CAPTURE_US] pattern [PATTERN_US] wrap [WRAP_US] from peer [PEER]",
			"description": "Returns how many microseconds after the displayed pattern time the local frame was captured. CAPTURE_US is a local timestamp, PATTERN_US is the decoded display time in the peer's clock, and WRAP_US is the pattern repeat period, or 0 when the pattern never repeats. Errors when the peer clock has not been probed yet. A negative result means the clock offset or the frame age correction exceeded the real latency.",
			"arguments": {
				"CAPTURE_US": {
					"type": "NUMBER",
					"defaultValue": "0"
				},
				"PATTERN_US": {
					"type": "NUMBER",
					"defaultValue": "0"
				},
				"WRAP_US": {
					"type": "NUMBER",
					"defaultValue": "4096000"
				},
				"PEER": {
					"type": "STRING",
					"defaultValue": "peer-a"
				}
			}
		},
		{
			"opcode": "recordFrameSyncSample",
			"blockType": "COMMAND",
			"text": "record frame sync sample for camera [CAMERA] capture [CAPTURE_US] pattern [PATTERN_US] wrap [WRAP_US] from peer [PEER]",
			"description": "Converts one pattern observation into a latency sample and stores it for the camera slot. Errors when the peer clock has not been probed yet.",
			"arguments": {
				"CAMERA": {
					"type": "STRING",
					"defaultValue": "camera-1"
				},
				"CAPTURE_US": {
					"type": "NUMBER",
					"defaultValue": "0"
				},
				"PATTERN_US": {
					"type": "NUMBER",
					"defaultValue": "0"
				},
				"WRAP_US": {
					"type": "NUMBER",
					"defaultValue": "4096000"
				},
				"PEER": {
					"type": "STRING",
					"defaultValue": "peer-a"
				}
			}
		},
		{
			"opcode": "clearFrameSyncSamples",
			"blockType": "COMMAND",
			"text": "clear frame sync samples for camera [CAMERA]",
			"description": "Clears the latency samples stored for the camera slot.",
			"arguments": { "CAMERA": {
				"type": "STRING",
				"defaultValue": "camera-1"
			} }
		},
		{
			"opcode": "frameSyncSampleCount",
			"blockType": "REPORTER",
			"text": "frame sync sample count for camera [CAMERA]",
			"description": "Returns how many latency samples are stored for the camera slot.",
			"arguments": { "CAMERA": {
				"type": "STRING",
				"defaultValue": "camera-1"
			} }
		},
		{
			"opcode": "frameSyncSummary",
			"blockType": "REPORTER",
			"text": "frame sync summary for camera [CAMERA]",
			"description": "Returns the local latency summary for the camera slot as a JSON report.",
			"arguments": { "CAMERA": {
				"type": "STRING",
				"defaultValue": "camera-1"
			} }
		},
		{
			"opcode": "sendFrameSyncReport",
			"blockType": "COMMAND",
			"text": "send frame sync report for camera [CAMERA] to peer [PEER]",
			"description": "Sends the camera slot's latency summary to the peer on the internal sync channel.",
			"arguments": {
				"CAMERA": {
					"type": "STRING",
					"defaultValue": "camera-1"
				},
				"PEER": {
					"type": "STRING",
					"defaultValue": "peer-a"
				}
			}
		},
		{
			"opcode": "frameSyncReport",
			"blockType": "REPORTER",
			"text": "frame sync report",
			"description": "Returns every received frame sync report together with per-camera offsets as JSON.",
			"arguments": {}
		},
		{
			"opcode": "frameSyncCameras",
			"blockType": "REPORTER",
			"text": "frame sync cameras",
			"description": "Returns a JSON array of the camera slots that have reported.",
			"arguments": {}
		},
		{
			"opcode": "frameSyncLatencyOfCamera",
			"blockType": "REPORTER",
			"text": "frame sync latency us of camera [CAMERA]",
			"description": "Returns the reported median capture latency of the camera slot in microseconds.",
			"arguments": { "CAMERA": {
				"type": "STRING",
				"defaultValue": "camera-1"
			} }
		},
		{
			"opcode": "frameSyncOffsetOfCamera",
			"blockType": "REPORTER",
			"text": "frame sync offset us of camera [CAMERA]",
			"description": "Returns how many microseconds later than the reference camera this camera finishes recording a frame. Subtract it from the camera's frame timestamps to align the cameras.",
			"arguments": { "CAMERA": {
				"type": "STRING",
				"defaultValue": "camera-1"
			} }
		},
		{
			"opcode": "clearFrameSyncReport",
			"blockType": "COMMAND",
			"text": "clear frame sync report",
			"description": "Clears every received frame sync report.",
			"arguments": {}
		}
	],
	menus: { "networkMessages": {
		"acceptReporters": false,
		"items": [
			"door-open",
			"event",
			"*"
		]
	} }
};
//#endregion
//#region src/feature-flags.ts
var defaultFeatureFlags = { latestDataChannels: false };
function encodePairingCode(code) {
	return encodeBase64Url(JSON.stringify(code));
}
function decodePairingCode(value) {
	const parsed = JSON.parse(decodeBase64Url(value.trim()));
	if (parsed.version !== 1) throw new Error(`Unsupported pairing code version: ${String(parsed.version)}`);
	if (parsed.kind !== "offer" && parsed.kind !== "answer") throw new Error("Pairing code kind must be offer or answer.");
	if (!parsed.description || typeof parsed.description.type !== "string") throw new Error("Pairing code does not contain a session description.");
	return parsed;
}
function parsePayload(value) {
	const trimmed = value.trim();
	if (trimmed.length === 0) return {};
	try {
		return JSON.parse(trimmed);
	} catch {
		return value;
	}
}
function serializeEnvelope(envelope) {
	return JSON.stringify(envelope);
}
function parseEnvelope(peer, value) {
	const parsed = JSON.parse(value);
	if (parsed.version !== 1) throw new Error(`Unsupported message version: ${String(parsed.version)}`);
	if (typeof parsed.id !== "string" || typeof parsed.type !== "string") throw new Error("Message is missing required fields.");
	return {
		...parsed,
		peer
	};
}
function encodeBase64Url(value) {
	const bytes = new TextEncoder().encode(value);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function decodeBase64Url(value) {
	const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
	const binary = atob(padded);
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}
//#endregion
//#region src/manual-peer-session.ts
var channelLabel = "tm-events";
var latestDataChannelLabelPrefix = "tm-latest:";
var defaultQueueLimit = 200;
var defaultLatestDataHighWaterMark = 262144;
var ManualPeerSession = class {
	constructor(options = {}) {
		this.peers = /* @__PURE__ */ new Map();
		this.iceMode = "lan";
		this.latestDataConfigurations = /* @__PURE__ */ new Map();
		this.receiveQueue = [];
		this.seq = 0;
		this.localId = options.localId ?? randomId();
		this.queueLimit = options.queueLimit ?? defaultQueueLimit;
		this.latestDataEnabled = options.latestDataEnabled ?? false;
		this.peerConnectionFactory = options.peerConnectionFactory ?? ((configuration) => new RTCPeerConnection(configuration));
	}
	setIceMode(mode) {
		const normalized = mode.trim().toLowerCase();
		this.iceMode = normalized === "stun" ? "stun" : "lan";
		return this.iceMode;
	}
	async createOffer(peer) {
		const record = this.createPeer(peer);
		const channel = record.connection.createDataChannel(channelLabel, { ordered: true });
		this.attachControlChannel(peer, record, channel);
		if (this.latestDataEnabled) for (const [name, highWaterMark] of this.configurationsFor(peer)) {
			const latestChannel = record.connection.createDataChannel(this.latestDataLabel(name), {
				ordered: false,
				maxRetransmits: 0
			});
			this.attachLatestDataChannel(peer, record, name, latestChannel, highWaterMark);
		}
		const offer = await record.connection.createOffer();
		await record.connection.setLocalDescription(offer);
		await waitForIceGathering(record.connection);
		const code = this.makePairingCode("offer", record.connection.localDescription);
		record.offerCode = code;
		return code;
	}
	getOffer(peer) {
		return this.peers.get(peer.trim())?.offerCode ?? "";
	}
	async acceptOffer(peer, code) {
		const offer = decodePairingCode(code);
		if (offer.kind !== "offer") throw new Error("Expected an offer pairing code.");
		const record = this.createPeer(peer);
		await record.connection.setRemoteDescription(offer.description);
		const answer = await record.connection.createAnswer();
		await record.connection.setLocalDescription(answer);
		await waitForIceGathering(record.connection);
		const answerCode = this.makePairingCode("answer", record.connection.localDescription);
		record.answerCode = answerCode;
		return answerCode;
	}
	getAnswer(peer) {
		return this.peers.get(peer.trim())?.answerCode ?? "";
	}
	async acceptAnswer(peer, code) {
		const answer = decodePairingCode(code);
		if (answer.kind !== "answer") throw new Error("Expected an answer pairing code.");
		await this.requirePeer(peer).connection.setRemoteDescription(answer.description);
	}
	sendEvent(peer, type, payloadText, channel) {
		const targets = peer.trim() === "*" ? this.connectedPeers() : [peer.trim()];
		for (const target of targets) this.sendToPeer(target, this.createEnvelope(type, payloadText, channel));
	}
	setLatestDataEnabled(enabled) {
		this.latestDataEnabled = enabled;
		if (!enabled) for (const record of this.peers.values()) {
			for (const latest of record.latestChannels.values()) latest.channel.close();
			record.latestChannels.clear();
		}
	}
	configureLatestDataChannel(peer, channel, highWaterMark) {
		const peerName = normalizeName(peer, "peer");
		const channelName = normalizeName(channel, "pose");
		const limit = normalizeHighWaterMark(highWaterMark);
		let configurations = this.latestDataConfigurations.get(peerName);
		if (!configurations) {
			configurations = /* @__PURE__ */ new Map();
			this.latestDataConfigurations.set(peerName, configurations);
		}
		configurations.set(channelName, limit);
	}
	sendLatestData(peer, channel, payloadText) {
		if (!this.latestDataEnabled) return "unavailable";
		const peerName = normalizeName(peer, "peer");
		const channelName = normalizeName(channel, "pose");
		const latest = this.peers.get(peerName)?.latestChannels.get(channelName);
		if (!latest || latest.channel.readyState !== "open") return "unavailable";
		if (latest.channel.bufferedAmount > latest.highWaterMark) {
			latest.droppedCount += 1;
			return "dropped";
		}
		latest.channel.send(serializeEnvelope(this.createEnvelope("latest-data", payloadText, channelName)));
		latest.sentCount += 1;
		return "sent";
	}
	latestDataStats(peer, channel) {
		if (!this.latestDataEnabled) return emptyLatestDataStats("disabled", 0);
		const peerName = normalizeName(peer, "peer");
		const channelName = normalizeName(channel, "pose");
		const configured = this.latestDataConfigurations.get(peerName)?.get(channelName);
		const latest = this.peers.get(peerName)?.latestChannels.get(channelName);
		if (!latest) return emptyLatestDataStats("not-configured", configured ?? 0);
		return {
			state: latest.channel.readyState,
			bufferedAmount: latest.channel.bufferedAmount,
			sentCount: latest.sentCount,
			droppedCount: latest.droppedCount,
			highWaterMark: latest.highWaterMark,
			dropPolicy: "drop-newest"
		};
	}
	setMessageHandler(handler) {
		this.messageHandler = handler;
	}
	setInternalHandler(handler) {
		this.internalHandler = handler;
	}
	hasMessages() {
		return this.receiveQueue.length > 0;
	}
	messageCount() {
		return this.receiveQueue.length;
	}
	nextMessage() {
		const message = this.receiveQueue.shift();
		return message ? JSON.stringify(message) : "";
	}
	lastMessage() {
		return this.latestMessage ? JSON.stringify(this.latestMessage) : "";
	}
	clearMessages() {
		this.receiveQueue = [];
		this.latestMessage = void 0;
	}
	connectionState(peer) {
		return this.peers.get(peer.trim())?.connection.connectionState ?? "closed";
	}
	/** Distinguishes a peer that was never created from one that closed. */
	hasPeer(peer) {
		return this.peers.has(peer.trim());
	}
	connectedPeers() {
		return [...this.peers.entries()].filter(([, record]) => record.connection.connectionState === "connected" && record.controlChannel?.readyState === "open").map(([peer]) => peer);
	}
	closePeer(peer) {
		const key = peer.trim();
		const record = this.peers.get(key);
		if (!record) return;
		record.controlChannel?.close();
		for (const latest of record.latestChannels.values()) latest.channel.close();
		record.connection.close();
		this.peers.delete(key);
	}
	closeAll() {
		for (const peer of [...this.peers.keys()]) this.closePeer(peer);
		this.latestDataConfigurations.clear();
		this.setMessageHandler(void 0);
		this.setInternalHandler(void 0);
	}
	createPeer(peer) {
		const key = peer.trim();
		this.closePeer(key);
		const connection = this.peerConnectionFactory(this.configuration());
		const record = {
			connection,
			latestChannels: /* @__PURE__ */ new Map()
		};
		connection.ondatachannel = (event) => this.acceptIncomingChannel(key, record, event.channel);
		connection.onconnectionstatechange = () => {
			if (connection.connectionState === "failed" || connection.connectionState === "closed") {
				record.controlChannel?.close();
				for (const latest of record.latestChannels.values()) latest.channel.close();
				delete record.controlChannel;
				record.latestChannels.clear();
			}
		};
		this.peers.set(key, record);
		return record;
	}
	attachControlChannel(peer, record, channel) {
		record.controlChannel = channel;
		this.attachMessageHandler(peer, channel);
	}
	acceptIncomingChannel(peer, record, channel) {
		if (channel.label === channelLabel) {
			this.attachControlChannel(peer, record, channel);
			return;
		}
		const name = this.latestDataName(channel.label);
		if (!name || !this.latestDataEnabled) {
			channel.close();
			return;
		}
		const highWaterMark = this.latestDataConfigurations.get(peer)?.get(name) ?? 262144;
		this.attachLatestDataChannel(peer, record, name, channel, highWaterMark);
	}
	attachLatestDataChannel(peer, record, name, channel, highWaterMark) {
		record.latestChannels.get(name)?.channel.close();
		record.latestChannels.set(name, {
			channel,
			highWaterMark,
			sentCount: 0,
			droppedCount: 0
		});
		this.attachMessageHandler(peer, channel);
	}
	attachMessageHandler(peer, channel) {
		channel.onmessage = (event) => {
			if (typeof event.data !== "string") return;
			try {
				this.pushMessage(parseEnvelope(peer, event.data));
			} catch {
				this.pushMessage({
					version: 1,
					id: randomId(),
					seq: 0,
					from: peer,
					peer,
					channel: "raw",
					type: "raw",
					payload: event.data,
					timestamp: Date.now()
				});
			}
		};
	}
	sendToPeer(peer, envelope) {
		const record = this.requirePeer(peer);
		if (!record.controlChannel || record.controlChannel.readyState !== "open") throw new Error(`Peer ${peer} is not ready for sending.`);
		record.controlChannel.send(serializeEnvelope(envelope));
	}
	createEnvelope(type, payloadText, channel) {
		return {
			version: 1,
			id: randomId(),
			seq: ++this.seq,
			from: this.localId,
			channel: channel.trim() || "default",
			type: type.trim() || "event",
			payload: parsePayload(payloadText),
			timestamp: Date.now()
		};
	}
	pushMessage(message) {
		if (this.consumeInternally(message)) return;
		this.receiveQueue.push(message);
		while (this.receiveQueue.length > this.queueLimit) this.receiveQueue.shift();
		this.latestMessage = message;
		try {
			this.messageHandler?.(message);
		} catch {}
	}
	consumeInternally(message) {
		if (!this.internalHandler) return false;
		try {
			return this.internalHandler(message) === true;
		} catch {
			return true;
		}
	}
	makePairingCode(kind, description) {
		if (!description) throw new Error("Local session description is not available.");
		return encodePairingCode({
			version: 1,
			kind,
			description: description.toJSON()
		});
	}
	requirePeer(peer) {
		const key = peer.trim();
		const record = this.peers.get(key);
		if (!record) throw new Error(`Peer ${key} does not exist.`);
		return record;
	}
	configuration() {
		if (this.iceMode === "lan") return { iceServers: [] };
		return { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
	}
	configurationsFor(peer) {
		return this.latestDataConfigurations.get(normalizeName(peer, "peer")) ?? /* @__PURE__ */ new Map();
	}
	latestDataLabel(name) {
		return `${latestDataChannelLabelPrefix}${encodeURIComponent(name)}`;
	}
	latestDataName(label) {
		if (!label.startsWith(latestDataChannelLabelPrefix)) return void 0;
		try {
			return normalizeName(decodeURIComponent(label.slice(10)), "pose");
		} catch {
			return;
		}
	}
};
function normalizeName(value, fallback) {
	return value.trim() || fallback;
}
function normalizeHighWaterMark(value) {
	return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : defaultLatestDataHighWaterMark;
}
function emptyLatestDataStats(state, highWaterMark) {
	return {
		state,
		bufferedAmount: 0,
		sentCount: 0,
		droppedCount: 0,
		highWaterMark,
		dropPolicy: "drop-newest"
	};
}
function waitForIceGathering(connection) {
	if (connection.iceGatheringState === "complete") return Promise.resolve();
	return new Promise((resolve) => {
		const done = () => {
			if (connection.iceGatheringState === "complete") {
				connection.removeEventListener("icegatheringstatechange", done);
				resolve();
			}
		};
		connection.addEventListener("icegatheringstatechange", done);
		setTimeout(done, 0);
	});
}
function randomId() {
	if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
	return Math.random().toString(36).slice(2);
}
var runtimeCapabilityKey = "kubohiroyaWebRtcCapability";
var supportedVersions = [
	1,
	2,
	3
];
function createRuntimeCapability(session) {
	const capability = {
		version: 3,
		requireVersion(version) {
			if (!supportedVersions.includes(version)) throw new Error(`Unsupported WebRTC runtime capability version: ${version}; supported versions are ${supportedVersions.join(", ")}.`);
			return capability;
		},
		createOffer: (peer) => session.createOffer(normalizePeer(peer)),
		getOffer: (peer) => session.getOffer(normalizePeer(peer)),
		acceptOffer: (peer, code) => session.acceptOffer(normalizePeer(peer), code),
		getAnswer: (peer) => session.getAnswer(normalizePeer(peer)),
		acceptAnswer: (peer, code) => session.acceptAnswer(normalizePeer(peer), code),
		connectionState: (peer) => session.connectionState(normalizePeer(peer)),
		hasPeer: (peer) => session.hasPeer(normalizePeer(peer)),
		closePeer: (peer) => session.closePeer(normalizePeer(peer)),
		setLatestDataEnabled: (enabled) => session.setLatestDataEnabled(enabled),
		configureLatestDataChannel: (peer, channel, highWaterMark) => session.configureLatestDataChannel(normalizePeer(peer), channel, highWaterMark),
		sendLatestData: (peer, channel, payloadText) => session.sendLatestData(normalizePeer(peer), channel, payloadText),
		latestDataStats: (peer, channel) => session.latestDataStats(normalizePeer(peer), channel)
	};
	return Object.freeze(capability);
}
/**
* Matches the block layer's peer normalization, so a capability caller and a
* block reach the same RTCPeerConnection for the same name.
*/
function normalizePeer(peer) {
	return String(peer ?? "").trim() || "peer";
}
//#endregion
//#region src/sync-protocol.ts
/**
* Wire contracts shared by the clock probe and the frame sync report.
*
* The clock probe payload mirrors the `twmp/clock-probe` version 1 contract
* defined by the turbowarp-realtime-motion-capture-app protocol: integer microsecond
* timestamps, a monotonically increasing sequence number, and no extra
* properties. Frame sync reports use the same style so that they can be
* promoted to a versioned schema without changing the runtime code.
*/
/**
* Internal channel used for sync traffic so it never reaches the receive queue.
*
* The name is namespaced because everything the transport consumes on it is
* invisible to the project: a plain name like `sync` would silently swallow
* application messages that happened to pick the same channel.
*/
var syncChannel = "twmp/sync";
var clockProbeSchema = "twmp/clock-probe";
var frameSyncReportSchema = "twmp/frame-sync-report";
function createClockPing(sequence, t0Us) {
	return {
		schema: clockProbeSchema,
		version: 1,
		kind: "ping",
		sequence: toSafeInteger(sequence),
		t0Us: toSafeInteger(t0Us)
	};
}
function createClockPong(ping, t1Us, t2Us) {
	return {
		schema: clockProbeSchema,
		version: 1,
		kind: "pong",
		sequence: ping.sequence,
		t0Us: ping.t0Us,
		t1Us: toSafeInteger(t1Us),
		t2Us: toSafeInteger(t2Us)
	};
}
function parseClockProbe(value) {
	const record = asRecord(value);
	if (!record) return void 0;
	if (record.schema !== "twmp/clock-probe" || record.version !== 1) return void 0;
	const sequence = asSafeInteger(record.sequence);
	const t0Us = asSafeInteger(record.t0Us);
	if (sequence === void 0 || t0Us === void 0) return void 0;
	if (record.kind === "ping") return {
		schema: clockProbeSchema,
		version: 1,
		kind: "ping",
		sequence,
		t0Us
	};
	if (record.kind !== "pong") return void 0;
	const t1Us = asSafeInteger(record.t1Us);
	const t2Us = asSafeInteger(record.t2Us);
	if (t1Us === void 0 || t2Us === void 0) return void 0;
	return {
		schema: clockProbeSchema,
		version: 1,
		kind: "pong",
		sequence,
		t0Us,
		t1Us,
		t2Us
	};
}
function parseFrameSyncReport(value) {
	const record = asRecord(value);
	if (!record) return void 0;
	if (record.schema !== "twmp/frame-sync-report") return void 0;
	if (record.version !== 1) return void 0;
	const cameraId = asNonEmptyString(record.cameraId);
	const measuredAtUs = asSafeInteger(record.measuredAtUs);
	const latencyUs = asLatencyStats(record.latencyUs);
	if (cameraId === void 0 || measuredAtUs === void 0 || !latencyUs) return void 0;
	return {
		schema: frameSyncReportSchema,
		version: 1,
		cameraId,
		referencePeer: asNonEmptyString(record.referencePeer) ?? "",
		measuredAtUs,
		latencyUs,
		clock: asClockQuality(record.clock)
	};
}
/** Current local time in microseconds, using the highest resolution clock available. */
function nowMicroseconds() {
	if (typeof performance === "object" && typeof performance.now === "function") return Math.round((performance.timeOrigin + performance.now()) * 1e3);
	return Date.now() * 1e3;
}
function asLatencyStats(value) {
	const record = asRecord(value);
	if (!record) return void 0;
	const count = asSafeInteger(record.count);
	if (count === void 0) return void 0;
	const numbers = {};
	for (const key of [
		"min",
		"p10",
		"median",
		"p90",
		"max",
		"mean",
		"mad",
		"stddev"
	]) {
		const parsed = asFiniteNumber(record[key]);
		if (parsed === void 0) return void 0;
		numbers[key] = parsed;
	}
	return {
		count,
		min: numbers.min ?? 0,
		p10: numbers.p10 ?? 0,
		median: numbers.median ?? 0,
		p90: numbers.p90 ?? 0,
		max: numbers.max ?? 0,
		mean: numbers.mean ?? 0,
		mad: numbers.mad ?? 0,
		stddev: numbers.stddev ?? 0
	};
}
function asClockQuality(value) {
	const record = asRecord(value);
	if (!record) return null;
	const offsetUs = asFiniteNumber(record.offsetUs);
	const rttUs = asFiniteNumber(record.rttUs);
	const uncertaintyUs = asFiniteNumber(record.uncertaintyUs);
	const samples = asSafeInteger(record.samples);
	if (offsetUs === void 0 || rttUs === void 0) return null;
	if (uncertaintyUs === void 0 || samples === void 0) return null;
	return {
		offsetUs,
		rttUs,
		uncertaintyUs,
		samples
	};
}
function asRecord(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
	return value;
}
function asNonEmptyString(value) {
	return typeof value === "string" && value.length > 0 ? value : void 0;
}
function asFiniteNumber(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function asSafeInteger(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : void 0;
}
function toSafeInteger(value) {
	const rounded = Math.round(value);
	if (!Number.isSafeInteger(rounded) || rounded < 0) throw new RangeError("Clock probe timestamps must be non-negative safe integers.");
	return rounded;
}
//#endregion
//#region src/frame-sync.ts
var defaultSampleLimit = 2e4;
/**
* Converts one decoded pattern observation into a capture latency.
*
* `captureUs` must already be expressed in the clock that produced `patternUs`.
* A positive `wrapUs` unwraps a pattern whose encoded time repeats, resolving it
* to the half wrap period nearest zero rather than to the first positive
* residue. Folding to a positive residue would turn a latency that is slightly
* negative, which a clock offset error or an over-corrected frame age produces,
* into an outlier just under a full wrap period and wreck the mean, the
* percentiles and the spread of the summary. Keeping it negative leaves the
* mistake visible. The result is correct while the true latency stays within
* half the wrap period.
*/
function frameLatencyUs(captureUs, patternUs, wrapUs = 0) {
	const latency = captureUs - patternUs;
	if (!(wrapUs > 0)) return latency;
	const half = wrapUs / 2;
	return ((latency + half) % wrapUs + wrapUs) % wrapUs - half;
}
function summarizeLatencies(values) {
	const finite = values.filter((value) => Number.isFinite(value));
	if (finite.length === 0) return void 0;
	const sorted = [...finite].sort((left, right) => left - right);
	const median = percentile(sorted, .5);
	const mean = sorted.reduce((total, value) => total + value, 0) / sorted.length;
	const variance = sorted.reduce((total, value) => total + (value - mean) ** 2, 0) / sorted.length;
	const deviations = sorted.map((value) => Math.abs(value - median)).sort((a, b) => a - b);
	return {
		count: sorted.length,
		min: sorted[0] ?? 0,
		p10: percentile(sorted, .1),
		median,
		p90: percentile(sorted, .9),
		max: sorted[sorted.length - 1] ?? 0,
		mean,
		mad: percentile(deviations, .5),
		stddev: Math.sqrt(variance)
	};
}
function percentile(sorted, fraction) {
	if (sorted.length === 0) return 0;
	if (sorted.length === 1) return sorted[0] ?? 0;
	const position = (sorted.length - 1) * Math.min(1, Math.max(0, fraction));
	const lower = Math.floor(position);
	const upper = Math.ceil(position);
	const low = sorted[lower] ?? 0;
	return low + ((sorted[upper] ?? low) - low) * (position - lower);
}
/** Latency samples collected locally, grouped by camera slot. */
var LatencySampleStore = class {
	constructor(limit = defaultSampleLimit) {
		this.samples = /* @__PURE__ */ new Map();
		this.limit = Math.max(1, limit);
	}
	add(cameraId, latencyUs) {
		if (!Number.isFinite(latencyUs)) return;
		const bucket = this.samples.get(cameraId) ?? [];
		bucket.push(latencyUs);
		while (bucket.length > this.limit) bucket.shift();
		this.samples.set(cameraId, bucket);
	}
	count(cameraId) {
		return this.samples.get(cameraId)?.length ?? 0;
	}
	values(cameraId) {
		return this.samples.get(cameraId) ?? [];
	}
	summarize(cameraId) {
		return summarizeLatencies(this.values(cameraId));
	}
	clear(cameraId) {
		this.samples.delete(cameraId);
	}
	clearAll() {
		this.samples.clear();
	}
	cameras() {
		return [...this.samples.keys()].sort();
	}
};
function createFrameSyncReport(options) {
	return {
		schema: frameSyncReportSchema,
		version: 1,
		cameraId: options.cameraId,
		referencePeer: options.referencePeer,
		measuredAtUs: options.measuredAtUs,
		latencyUs: options.latencyUs,
		clock: options.clock
	};
}
/**
* Collected reports from every camera slot.
*
* The reference latency is the median of the per-camera median latencies, so a
* camera's offset says how much later that camera finishes recording a frame
* than the group as a whole. Subtracting the offset from a camera's frame
* timestamps aligns its frames with the other cameras.
*/
var FrameSyncRegistry = class {
	constructor() {
		this.entries = /* @__PURE__ */ new Map();
	}
	accept(report, peer, receivedAtUs) {
		const entry = {
			cameraId: report.cameraId,
			peer,
			referencePeer: report.referencePeer,
			latencyUs: report.latencyUs,
			offsetUs: 0,
			clock: report.clock,
			measuredAtUs: report.measuredAtUs,
			receivedAtUs
		};
		this.entries.set(report.cameraId, entry);
		return entry;
	}
	cameras() {
		return [...this.entries.keys()].sort();
	}
	has(cameraId) {
		return this.entries.has(cameraId);
	}
	referenceLatencyUs() {
		return percentile([...this.entries.values()].map((entry) => entry.latencyUs.median).sort((left, right) => left - right), .5);
	}
	latencyUsOf(cameraId) {
		return this.entries.get(cameraId)?.latencyUs.median ?? 0;
	}
	offsetUsOf(cameraId) {
		const entry = this.entries.get(cameraId);
		if (!entry) return 0;
		return entry.latencyUs.median - this.referenceLatencyUs();
	}
	overview() {
		const referenceLatencyUs = this.referenceLatencyUs();
		return {
			referenceLatencyUs,
			cameras: this.cameras().map((cameraId) => {
				const entry = this.entries.get(cameraId);
				return {
					...entry,
					offsetUs: entry.latencyUs.median - referenceLatencyUs
				};
			})
		};
	}
	clear() {
		this.entries.clear();
	}
};
//#endregion
//#region src/sync-clock.ts
var defaultExchanges = 24;
var defaultIntervalMs = 20;
var defaultTimeoutMs = 1e3;
/**
* A peer that answers at all answers the first probes. Giving up after a few
* silent ones keeps a peer without clock probe support, an older build for
* instance, from stalling the calling script for the whole exchange budget.
*/
var maxSilentExchanges = 3;
/**
* NTP-style clock offset estimation over an existing DataChannel.
*
* Every exchange records four timestamps: the request send time (t0), the remote
* receive time (t1), the remote reply send time (t2) and the local reply arrival
* time (t3). The offset that maps local time onto the remote clock is
* ((t1 - t0) + (t2 - t3)) / 2 and the round trip is (t3 - t0) - (t2 - t1).
* Exchanges with the shortest round trip carry the least queuing noise, so only
* the fastest quarter of the exchanges is averaged.
*/
var ClockSync = class {
	constructor(options) {
		this.estimates = /* @__PURE__ */ new Map();
		this.pending = /* @__PURE__ */ new Map();
		this.sequence = 0;
		this.send = options.send;
		this.nowUs = options.nowUs ?? nowMicroseconds;
		this.wait = options.wait ?? defaultWait;
		this.exchanges = Math.max(1, Math.trunc(options.exchanges ?? defaultExchanges));
		this.intervalMs = Math.max(0, options.intervalMs ?? defaultIntervalMs);
		this.timeoutMs = Math.max(1, options.timeoutMs ?? defaultTimeoutMs);
	}
	async syncWith(peer) {
		const samples = [];
		let silent = 0;
		for (let index = 0; index < this.exchanges; index += 1) {
			if (index > 0 && this.intervalMs > 0) await this.wait(this.intervalMs);
			const sample = await this.exchange(peer);
			if (sample) {
				samples.push(sample);
				silent = 0;
			} else if (++silent >= maxSilentExchanges) break;
		}
		if (samples.length === 0) throw new Error(`Peer ${peer} did not answer ${silent} clock probes. It may be running a build without clock probe support.`);
		const estimate = summarizeExchanges(peer, samples, this.nowUs());
		this.estimates.set(peer, estimate);
		return estimate;
	}
	/** Handles a clock probe envelope. Returns true when the message was consumed. */
	handleMessage(peer, type, payload) {
		if (type !== "twmp/clock-probe") return false;
		const probe = parseClockProbe(payload);
		if (!probe) return true;
		if (probe.kind === "ping") {
			const t1Us = this.nowUs();
			this.send(peer, clockProbeSchema, createClockPong(probe, t1Us, this.nowUs()));
			return true;
		}
		const resolve = this.pending.get(this.key(peer, probe.sequence));
		if (resolve) {
			this.pending.delete(this.key(peer, probe.sequence));
			resolve(probe);
		}
		return true;
	}
	estimate(peer) {
		return this.estimates.get(peer);
	}
	quality(peer) {
		const estimate = this.estimates.get(peer);
		if (!estimate) return null;
		return {
			offsetUs: estimate.offsetUs,
			rttUs: estimate.rttUs,
			uncertaintyUs: estimate.uncertaintyUs,
			samples: estimate.samples
		};
	}
	offsetUsTo(peer) {
		return this.estimates.get(peer)?.offsetUs ?? 0;
	}
	rttUsTo(peer) {
		return this.estimates.get(peer)?.rttUs ?? 0;
	}
	uncertaintyUsTo(peer) {
		return this.estimates.get(peer)?.uncertaintyUs ?? 0;
	}
	hasEstimate(peer) {
		return this.estimates.has(peer);
	}
	/** Converts a local microsecond timestamp into the named peer's clock. */
	toPeerTimeUs(peer, localUs) {
		return localUs + this.offsetUsTo(peer);
	}
	localTimeUs() {
		return this.nowUs();
	}
	forget(peer) {
		this.estimates.delete(peer);
	}
	async exchange(peer) {
		const sequence = this.sequence++;
		const key = this.key(peer, sequence);
		const ping = createClockPing(sequence, this.nowUs());
		const answered = new Promise((resolve) => {
			this.pending.set(key, resolve);
			this.wait(this.timeoutMs).then(() => {
				if (this.pending.delete(key)) resolve(void 0);
			});
		});
		this.send(peer, clockProbeSchema, ping);
		const pong = await answered;
		if (!pong) return void 0;
		const t3Us = this.nowUs();
		return {
			offsetUs: (pong.t1Us - pong.t0Us + (pong.t2Us - t3Us)) / 2,
			rttUs: t3Us - pong.t0Us - (pong.t2Us - pong.t1Us)
		};
	}
	key(peer, sequence) {
		return `${peer}#${sequence}`;
	}
};
function summarizeExchanges(peer, samples, updatedAtUs) {
	const sorted = [...samples].sort((left, right) => left.rttUs - right.rttUs);
	const keep = Math.max(1, Math.round(sorted.length / 4));
	const best = sorted.slice(0, keep);
	const offsetUs = best.reduce((total, sample) => total + sample.offsetUs, 0) / best.length;
	const rttUs = sorted[0]?.rttUs ?? 0;
	return {
		peer,
		offsetUs,
		rttUs,
		uncertaintyUs: rttUs / 2,
		samples: samples.length,
		updatedAtUs
	};
}
function defaultWait(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
//#endregion
//#region src/sync-service.ts
/**
* Clock probing and frame sync reporting on top of an existing peer transport.
*
* All sync traffic travels on a dedicated channel that the session keeps out of
* the user-visible receive queue, so probing at a high rate never evicts
* application messages.
*/
var SyncService = class {
	constructor(transport, options = {}) {
		this.registry = new FrameSyncRegistry();
		this.referencePeers = /* @__PURE__ */ new Map();
		this.transport = transport;
		this.nowUs = options.nowUs ?? nowMicroseconds;
		this.samples = new LatencySampleStore(options.sampleLimit);
		this.clock = new ClockSync({
			...options,
			nowUs: this.nowUs,
			send: (peer, type, payload) => this.send(peer, type, payload)
		});
	}
	/**
	* Handles sync traffic. Returns true when the envelope was consumed.
	*
	* Only the two known payloads are claimed. Anything else, even on the
	* internal channel, is left for the application so that a stray envelope
	* surfaces in the receive queue instead of disappearing. Dispatch failures
	* are contained here: an envelope this service claimed must never fall
	* through and start application hat blocks.
	*/
	handleEnvelope(message) {
		if (message.channel !== "twmp/sync") return false;
		if (message.type !== "twmp/clock-probe" && message.type !== "twmp/frame-sync-report") return false;
		try {
			if (message.type === "twmp/clock-probe") this.clock.handleMessage(message.peer, message.type, message.payload);
			else {
				const report = parseFrameSyncReport(message.payload);
				if (report) this.registry.accept(report, message.peer, this.nowUs());
			}
		} catch {}
		return true;
	}
	async syncClock(peer) {
		return this.clock.syncWith(peer);
	}
	clockOffsetUs(peer) {
		return this.clock.offsetUsTo(peer);
	}
	clockRoundTripUs(peer) {
		return this.clock.rttUsTo(peer);
	}
	clockUncertaintyUs(peer) {
		return this.clock.uncertaintyUsTo(peer);
	}
	localTimeUs() {
		return this.nowUs();
	}
	peerTimeUs(peer) {
		this.requireEstimate(peer);
		return this.clock.toPeerTimeUs(peer, this.localTimeUs());
	}
	/**
	* Latency between the moment the pattern was shown and the moment this
	* computer finished recording the frame, expressed in the peer's clock.
	*/
	frameLatency(captureUs, patternUs, wrapUs, peer) {
		this.requireEstimate(peer);
		return frameLatencyUs(this.clock.toPeerTimeUs(peer, captureUs), patternUs, wrapUs);
	}
	recordSample(cameraId, captureUs, patternUs, wrapUs, peer) {
		const latency = this.frameLatency(captureUs, patternUs, wrapUs, peer);
		this.samples.add(cameraId, latency);
		this.referencePeers.set(cameraId, peer);
		return latency;
	}
	clearSamples(cameraId) {
		this.samples.clear(cameraId);
		this.referencePeers.delete(cameraId);
	}
	sampleCount(cameraId) {
		return this.samples.count(cameraId);
	}
	localReport(cameraId) {
		const latencyUs = this.samples.summarize(cameraId);
		if (!latencyUs) return void 0;
		const referencePeer = this.referencePeers.get(cameraId) ?? "";
		return createFrameSyncReport({
			cameraId,
			referencePeer,
			measuredAtUs: this.nowUs(),
			latencyUs,
			clock: referencePeer ? this.clock.quality(referencePeer) : null
		});
	}
	sendReport(cameraId, peer) {
		const report = this.localReport(cameraId);
		if (!report) throw new Error(`Camera ${cameraId} has no frame sync samples to report.`);
		this.send(peer, frameSyncReportSchema, report);
		return report;
	}
	reportOverview() {
		return JSON.stringify(this.registry.overview());
	}
	reportCameras() {
		return JSON.stringify(this.registry.cameras());
	}
	reportLatencyUs(cameraId) {
		return this.registry.latencyUsOf(cameraId);
	}
	reportOffsetUs(cameraId) {
		return this.registry.offsetUsOf(cameraId);
	}
	clearReport() {
		this.registry.clear();
	}
	/**
	* Refuses to express a local timestamp in a clock that was never probed.
	*
	* Without an estimate the offset would silently be zero, which compares two
	* unrelated wall clocks and, once folded into the pattern wrap period, yields
	* a plausible looking latency that is pure noise.
	*/
	requireEstimate(peer) {
		if (!this.clock.hasEstimate(peer)) throw new Error(`Sync the clock with peer ${peer} before measuring frame latency.`);
	}
	send(peer, type, payload) {
		this.transport.sendEvent(peer, type, JSON.stringify(payload), syncChannel);
	}
};
//#endregion
//#region src/extension.ts
var blockDefinitions = block_definitions_default.blocks;
var networkMessageHatOpcode = `${extensionConfig.id}_whenReceiveNetworkMessage`;
var networkMessageThreadContextKey = "__turbowarpWebRtcNetworkMessage";
var WebRtcManualPairingExtension = class {
	constructor(session = new ManualPeerSession({ latestDataEnabled: defaultFeatureFlags.latestDataChannels }), sync) {
		this.session = session;
		this.sync = sync ?? new SyncService(session);
		this.runtimeCapability = createRuntimeCapability(session);
		this.session.setMessageHandler((message) => this.startNetworkMessageHats(message));
		this.session.setInternalHandler((message) => this.sync.handleEnvelope(message));
		const runtime = Scratch.vm?.runtime;
		if (runtime) runtime[runtimeCapabilityKey] = this.runtimeCapability;
	}
	getInfo() {
		const info = {
			id: extensionConfig.id,
			docsURI: "https://kubohiroya.github.io/turbowarp-webrtc/",
			blockIconURI: extensionConfig.blockIconURI,
			name: Scratch.translate(block_definitions_default.extensionName),
			blocks: blockDefinitions.map((block) => this.toScratchBlock(block)),
			menus: block_definitions_default.menus
		};
		this.fixedEditorsDispose ?? (this.fixedEditorsDispose = registerFixedInputEditors(Scratch, Scratch.vm?.runtime, info.blocks));
		return info;
	}
	setIceMode(args) {
		this.session.setIceMode(Scratch.Cast.toString(args.MODE));
	}
	async createOffer(args) {
		await this.session.createOffer(this.peer(args.PEER));
	}
	getOffer(args) {
		return this.session.getOffer(this.peer(args.PEER));
	}
	async acceptOffer(args) {
		await this.session.acceptOffer(this.peer(args.PEER), Scratch.Cast.toString(args.CODE));
	}
	getAnswer(args) {
		return this.session.getAnswer(this.peer(args.PEER));
	}
	async acceptAnswer(args) {
		await this.session.acceptAnswer(this.peer(args.PEER), Scratch.Cast.toString(args.CODE));
	}
	sendEvent(args) {
		this.session.sendEvent(Scratch.Cast.toString(args.PEER), Scratch.Cast.toString(args.TYPE), Scratch.Cast.toString(args.PAYLOAD), Scratch.Cast.toString(args.CHANNEL));
	}
	setLatestDataEnabled(args) {
		this.session.setLatestDataEnabled(Scratch.Cast.toBoolean(args.ENABLED));
	}
	configureLatestDataChannel(args) {
		this.session.configureLatestDataChannel(this.peer(args.PEER), Scratch.Cast.toString(args.CHANNEL), Scratch.Cast.toNumber(args.HIGH_WATER_MARK));
	}
	sendLatestData(args) {
		this.session.sendLatestData(this.peer(args.PEER), Scratch.Cast.toString(args.CHANNEL), Scratch.Cast.toString(args.PAYLOAD));
	}
	latestDataBufferedAmount(args) {
		return this.latestDataStats(args).bufferedAmount;
	}
	latestDataSentCount(args) {
		return this.latestDataStats(args).sentCount;
	}
	latestDataDroppedCount(args) {
		return this.latestDataStats(args).droppedCount;
	}
	latestDataChannelState(args) {
		return this.latestDataStats(args).state;
	}
	latestDataDropPolicy() {
		return "drop-newest";
	}
	runtimeCapabilityVersion() {
		return 3;
	}
	requireRuntimeCapabilityVersion(args) {
		this.runtimeCapability.requireVersion(Scratch.Cast.toNumber(args.VERSION));
	}
	broadcastNetworkMessage(args) {
		this.session.sendEvent(Scratch.Cast.toString(args.PEER), Scratch.Cast.toString(args.MESSAGE), Scratch.Cast.toString(args.PAYLOAD), Scratch.Cast.toString(args.CHANNEL));
	}
	networkMessagePayload(_args, util) {
		const message = this.networkMessageFor(util);
		return message ? JSON.stringify(message.payload) : "";
	}
	networkMessageSender(_args, util) {
		return this.networkMessageFor(util)?.from ?? "";
	}
	networkMessagePeer(_args, util) {
		return this.networkMessageFor(util)?.peer ?? "";
	}
	networkMessageChannel(_args, util) {
		return this.networkMessageFor(util)?.channel ?? "";
	}
	hasMessages() {
		return this.session.hasMessages();
	}
	messageCount() {
		return this.session.messageCount();
	}
	nextMessage() {
		return this.session.nextMessage();
	}
	lastMessage() {
		return this.session.lastMessage();
	}
	clearMessages() {
		this.session.clearMessages();
	}
	connectionState(args) {
		return this.session.connectionState(this.peer(args.PEER));
	}
	connectedPeers() {
		return JSON.stringify(this.session.connectedPeers());
	}
	closePeer(args) {
		this.session.closePeer(this.peer(args.PEER));
	}
	async syncClock(args) {
		await this.sync.syncClock(this.peer(args.PEER));
	}
	clockOffset(args) {
		return this.sync.clockOffsetUs(this.peer(args.PEER));
	}
	clockRoundTrip(args) {
		return this.sync.clockRoundTripUs(this.peer(args.PEER));
	}
	clockUncertainty(args) {
		return this.sync.clockUncertaintyUs(this.peer(args.PEER));
	}
	peerTime(args) {
		return this.sync.peerTimeUs(this.peer(args.PEER));
	}
	localTime() {
		return this.sync.localTimeUs();
	}
	frameLatency(args) {
		return this.sync.frameLatency(Scratch.Cast.toNumber(args.CAPTURE_US), Scratch.Cast.toNumber(args.PATTERN_US), Scratch.Cast.toNumber(args.WRAP_US), this.peer(args.PEER));
	}
	recordFrameSyncSample(args) {
		this.sync.recordSample(this.camera(args.CAMERA), Scratch.Cast.toNumber(args.CAPTURE_US), Scratch.Cast.toNumber(args.PATTERN_US), Scratch.Cast.toNumber(args.WRAP_US), this.peer(args.PEER));
	}
	clearFrameSyncSamples(args) {
		this.sync.clearSamples(this.camera(args.CAMERA));
	}
	frameSyncSampleCount(args) {
		return this.sync.sampleCount(this.camera(args.CAMERA));
	}
	frameSyncSummary(args) {
		const report = this.sync.localReport(this.camera(args.CAMERA));
		return report ? JSON.stringify(report) : "";
	}
	sendFrameSyncReport(args) {
		this.sync.sendReport(this.camera(args.CAMERA), this.peer(args.PEER));
	}
	frameSyncReport() {
		return this.sync.reportOverview();
	}
	frameSyncCameras() {
		return this.sync.reportCameras();
	}
	frameSyncLatencyOfCamera(args) {
		return this.sync.reportLatencyUs(this.camera(args.CAMERA));
	}
	frameSyncOffsetOfCamera(args) {
		return this.sync.reportOffsetUs(this.camera(args.CAMERA));
	}
	clearFrameSyncReport() {
		this.sync.clearReport();
	}
	dispose() {
		this.fixedEditorsDispose?.();
		this.session.closeAll();
		const runtime = Scratch.vm?.runtime;
		if (runtime?.["kubohiroyaWebRtcCapability"] === this.runtimeCapability) delete runtime[runtimeCapabilityKey];
	}
	peer(value) {
		return Scratch.Cast.toString(value).trim() || "peer";
	}
	camera(value) {
		return Scratch.Cast.toString(value).trim() || "camera";
	}
	latestDataStats(args) {
		return this.session.latestDataStats(this.peer(args.PEER), Scratch.Cast.toString(args.CHANNEL));
	}
	startNetworkMessageHats(message) {
		this.latestNetworkMessage = message;
		this.attachNetworkMessageContext(Scratch.vm?.runtime?.startHats(networkMessageHatOpcode, { MESSAGE: message.type }) ?? [], message);
		if (message.type !== "*") this.attachNetworkMessageContext(Scratch.vm?.runtime?.startHats(networkMessageHatOpcode, { MESSAGE: "*" }) ?? [], message);
	}
	attachNetworkMessageContext(threads, message) {
		for (const thread of threads) thread[networkMessageThreadContextKey] = message;
	}
	networkMessageFor(util) {
		const threadMessage = util?.thread?.[networkMessageThreadContextKey];
		return isReceivedEnvelope(threadMessage) ? threadMessage : this.latestNetworkMessage;
	}
	toScratchBlock(block) {
		return {
			opcode: block.opcode,
			blockType: Scratch.BlockType[block.blockType],
			text: Scratch.translate(block.text),
			...block.isEdgeActivated === void 0 ? {} : { isEdgeActivated: block.isEdgeActivated },
			arguments: Object.fromEntries(Object.entries(block.arguments).map(([name, argument]) => [name, {
				type: Scratch.ArgumentType[argument.type],
				defaultValue: argument.defaultValue,
				...argument.menu === void 0 ? {} : { menu: argument.menu }
			}]))
		};
	}
};
function isReceivedEnvelope(value) {
	return typeof value === "object" && value !== null && "type" in value && "payload" in value;
}
//#endregion
//#region src/index.ts
if (extensionConfig.unsandboxed && !Scratch.extensions.unsandboxed) throw new Error(`${extensionConfig.name} must run unsandboxed.`);
Scratch.extensions.register(new WebRtcManualPairingExtension());
//#endregion

})(Scratch);
