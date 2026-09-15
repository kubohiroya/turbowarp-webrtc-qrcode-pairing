// Name: TurboWarp-WebRTC-QRCode-Pairing
// ID: kubohiroyawebrtcqrcodepairing
// Description: QR-carried WebRTC pairing (initial scaffold; pairing not implemented).
// By: Hiroya Kubo
// License: MPL-2.0

(function (Scratch) {
  'use strict';

  //#region src/config.ts
  var extensionConfig = {
  	id: "kubohiroyawebrtcqrcodepairing",
  	slug: "webrtc-qrcode-pairing",
  	name: "TurboWarp-WebRTC-QRCode-Pairing",
  	description: "QR-carried WebRTC pairing (initial scaffold; pairing not implemented).",
  	author: "Hiroya Kubo",
  	license: "MPL-2.0",
  	unsandboxed: false,
  	docsURI: "https://github.com/kubohiroya/turbowarp-webrtc-qrcode-pairing#readme",
  	blockIconURI: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHJlY3QgeD0iNCIgeT0iOCIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE0IiByeD0iMyIgZmlsbD0iIzRDOTdGRiIvPjxyZWN0IHg9IjI2IiB5PSI4IiB3aWR0aD0iMTgiIGhlaWdodD0iMTQiIHJ4PSIzIiBmaWxsPSIjNTlDMDU5Ii8+PHJlY3QgeD0iMTUiIHk9IjI2IiB3aWR0aD0iMTgiIGhlaWdodD0iMTQiIHJ4PSIzIiBmaWxsPSIjRkZBQjE5Ii8+PC9zdmc+"
  };
  var block_definitions_default = {
  	extensionName: "TurboWarp-WebRTC-QRCode-Pairing",
  	blocks: [{
  		"opcode": "hello",
  		"blockType": "REPORTER",
  		"text": "hello [NAME]",
  		"description": "Returns a localized greeting for the supplied name.",
  		"arguments": { "NAME": {
  			"type": "STRING",
  			"defaultValue": "world"
  		} }
  	}]
  };
  //#endregion
  //#region src/extension.ts
  var blockDefinitions = block_definitions_default.blocks;
  var WebRtcQrCodePairingExtension = class {
  	getInfo() {
  		return {
  			id: extensionConfig.id,
  			name: Scratch.translate(block_definitions_default.extensionName),
  			docsURI: extensionConfig.docsURI,
  			blockIconURI: extensionConfig.blockIconURI,
  			blocks: blockDefinitions.map((block) => this.toScratchBlock(block))
  		};
  	}
  	hello(args) {
  		return Scratch.translate({
  			default: "Hello, {name}!",
  			description: "{name} is replaced with the value supplied to the block."
  		}, { name: Scratch.Cast.toString(args.NAME) });
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
  //#endregion
  //#region src/index.ts
  if (extensionConfig.unsandboxed && !Scratch.extensions.unsandboxed) throw new Error(`${extensionConfig.name} must run unsandboxed.`);
  Scratch.extensions.register(new WebRtcQrCodePairingExtension());
  //#endregion

})(Scratch);
