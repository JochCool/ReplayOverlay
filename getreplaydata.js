
// Load recording
const fs = require("fs");
const recording = fs.readFileSync("./recording.tmcpr");
const recordingLength = recording.length;

// These will be filled and written
let rounds = [];
let healths = {};

// Reads a VarInt at a certain place in the recording
// Returns an object with the length (bytes) and value of the VarInt/VarLong
function readVarInt(place) {
	let intPlace = 0, result = 0;
	do {
		result += (recording[place + intPlace] % 128) * Math.pow(128, intPlace); 
	}
	while (recording[place + intPlace++] > 127)
	return { length: intPlace, value: result };
};

// Reads a String (UTF-8 prefixed by a length as VarInt) at a certain place in the recording
// Returns an object with the full length (bytes) and the string itself
function readString(place) {
	let length = readVarInt(place);
	return {
		length: length.length + length.value,
		value: recording.slice(place + length.length, place + length.length + length.value).toString()
	};
}

// Old code
/*
// These are used for collecting data about the round
let lastData = {}, dataToAdd = {};
function addRoundData(key, value) {
	if (typeof lastData[key] == "undefined" || +value > lastData[key]) {
		console.log("Writing: " + key + "=" + value);
		if (typeof dataToAdd[key] !== "undefined") {
			rounds.push(dataToAdd);
			dataToAdd = {};
		}
		dataToAdd[key] = value;
	}
	lastData[key] = value;
};
*/

// The ID of the packet sent when a scoreboard changes (different across Minecraft versions)
const updateScoreID = 0x56;
/*
1.12.2 - 69 (0x45)
1.14.4 - 76 (0x4C)
1.15.2 - 77 (0x4D)
1.17.1 - 82 (0x56)
*/

// The ID of the packet sent when a title appears (different across Minecraft versions)
const titleID = 0x41;
/*
1.15.2 - 80 (0x50) (WITH action field)
1.17.1 - 65 (0x41) (WITHOUT action field)
*/

// Search through recording for Update Score packets
let ms, nextPacketIndex, prevRound, nextUpdate = 0;
for (let i = 0; i < recordingLength; i = nextPacketIndex) {
	
	// Read the header information
	ms = recording.readInt32BE(i);
	nextPacketIndex = i + 8 + recording.readInt32BE(i+4);
	let packetID = readVarInt(i+8);
	
	if (ms > nextUpdate) {
		console.log(`Currently at ${ms}ms or ${Math.floor(ms/60000)}min into the replay`);
		nextUpdate += 300000;
	}
	
	// Skip to the body of this packet
	i += 8 + packetID.length;
	
	switch (packetID.value) {
		
		case updateScoreID:
			// This packet contains: String(40) Entity Name, Byte Action, String(16) Objective Name, (optional) VarInt Value
	
			// Get entity name
			let entityName = readString(i);
			i += entityName.length;
			entityName = entityName.value;
			
			// Skip if it's action 1 (= remove scoreboard)
			if (recording[i] === 1) break;
			i++;
			
			// Check the scoreboard
			let objectiveName = readString(i);
			i += objectiveName.length;
			//console.log(`${ms}ms: Found objective update for ${entityName} of ${objectiveName.value}`);
			switch (objectiveName.value) {
				case "Health":
					// Create data for this person
					if (!healths[entityName]) healths[entityName] = [];
					
					healths[entityName].push({
						ms: ms,
						value: readVarInt(i).value
					});
					break;
				
				// Old code
				/*
				case "Time":
					addRoundData(entityName, readVarInt(i).value);
					break;
				*/
			}
			break;
		
		case titleID:
			// This packet contains: VarInt Action (only pre-1.17; should be 2), Chat Action bar text
			
			/*
			// Skip if it's not action 2 (action bar)
			let action = readVarInt(i);
			if (action.value != 2) break;
			i += action.length;
			*/

			// Analyse chat component
			let json = JSON.parse(readString(i).value);
			if (json === null || !Array.isArray(json.extra) || json.extra.length !== 1) break;
			
			let value;
			if (typeof json.extra[0].text !== "undefined") value = json.extra[0].text;
			else if (typeof json.extra[0].score != "undefined") value = json.extra[0].value;
			else break;

			if (prevRound == value) break;
			prevRound = value;

			rounds.push({
				ms: ms,
				value: value
			});

			// Old code
			/*
			let match = readString(i).value.match(/{"name":"Total","objective":"Round","value":"(\d+)"}/);
			if (match === null) break;
			addRoundData("Round", match[1]);
			dataToAdd.ms = ms;
			*/
	}
}

// Old code
//rounds.push(dataToAdd);

const output = {
	rounds: rounds,
	healths: healths
}

console.log("Finished! Data generated:");
console.log(output);

fs.writeFileSync("replaydata.json", JSON.stringify(output, null, '\t'));
