
const replaydata = require("./replaydata.json");
const path = require("path");

if (process.argv.length <= 2) {
	console.log("Please specify what you want: 'command' for a single FFmpeg command, or 'queue' for a ReplayMod render queue.");
	return;
}

switch (process.argv[2]) {
	case "command":
		// Get the timelines
		const input = process.argv.length > 3 ? process.argv[3] : "";
		const timeline = require("./timelines.json")[input];
		if (!timeline) {
			console.log("Invalid timeline name: " + input);
			return;
		}
		
		const result = `ffmpeg -i input.mp4 ${generateVideoFilters(timeline[0].keyframes)} output.mp4`;

		console.log("RESULT:");
		console.log(result);
		require('fs').writeFileSync("result.txt", result);
		console.log("Wrote result to result.txt.");
		break;
	
	case "queue":
		const renderQueue = require("./renderQueue.json");

		for (let timelineIndex = 0; timelineIndex < renderQueue.length; timelineIndex++) {
			/*
			if (!todo.includes(renderQueue[timelineIndex].settings.outputFile)) {
				renderQueue.splice(timelineIndex--, 1);
				continue;
			}
			//*/
			
			console.log(`Starting with ${renderQueue[timelineIndex].settings.outputFile}`);
		
			// Get the JSON-encoded keyframes
			const timekeyframes = JSON.parse(renderQueue[timelineIndex].timeline)[""][0].keyframes;

			const result = `-y -f rawvideo -pix_fmt bgra -s %WIDTH%x%HEIGHT% -r %FPS% -i - ${generateVideoFilters(timekeyframes)} -an -c:v libx264 -b:v %BITRATE% -pix_fmt yuv420p \"%FILENAME%\"`;
		
			renderQueue[timelineIndex].settings.exportArgumentsBgra = result;
			//renderQueue[timelineIndex].settings.highPerformance = true;
			
			console.log("Done");
		}

		require('fs').writeFileSync("result.json", JSON.stringify(renderQueue));
		
		console.log("Wrote result to result.json");
		break;
	
	default:
		console.log("Unknown option " + process.argv[2]);
		return;
}

function generateVideoFilters(timekeyframes) {

	// In the ReplayMod there are two timelines:
	// "Replay time" or "Time in the replay" is the amount of time in the Minecraft world, since the start of the recording (the top timeline in the ReplayMod UI)
	// "Video time" or "Time in the video" is the amount of time in the rendered video, since the start of the video (the bottom timeline in the ReplayMod UI)
	
	// Time in the replay where the video starts and ends
	const videoStart = timekeyframes[0].properties.timestamp;
	const videoEnd = timekeyframes[timekeyframes.length-1].properties.timestamp;

	/**
	 * Converts replay time to video time (i.e. it calculates how long into the video a given time in the replay is).
	 * @param {number} t The replay time. Must be between videoStart and videoEnd.
	 * @return {number} The video time.
	 */
	function toVideoTime(t) {
		for (let i = 0; i < timekeyframes.length; i++) {
			if (timekeyframes[i].properties.timestamp === t) {
				return timekeyframes[i].time;
			}
			if (timekeyframes[i].properties.timestamp > t) {
				// Percentage from the prev keyframe to this one: (ms - prev keyframe) / (this keyframe - prev keyframe)
				// Multiply by the difference in video time, add the video time of the prev keyframe
				return (t - timekeyframes[i-1].properties.timestamp) * (timekeyframes[i].time - timekeyframes[i-1].time) / (timekeyframes[i].properties.timestamp - timekeyframes[i-1].properties.timestamp) + timekeyframes[i-1].time; 
			}
		}
	}

	/**
	 * Converts video time to replay time (i.e. it calculates how long into the replay a given time in the video is).
	 * @param {number} t The video time. Must be between 0 and the length of the video.
	 * @return {number} The replay time.
	 */
	function toReplayTime(t) {
		for (let i = 0; i < timekeyframes.length; i++) {
			if (timekeyframes[i].time == t) {
				return timekeyframes[i].properties.timestamp;
			}
			if (timekeyframes[i].time > t) {
				// Inverse of above
				return (t - timekeyframes[i-1].time) * (timekeyframes[i].properties.timestamp - timekeyframes[i-1].properties.timestamp) / (timekeyframes[i].time - timekeyframes[i-1].time) + timekeyframes[i-1].properties.timestamp;
			}
		}
	}

	/**
	 * Calculates the length of a round, using the map's default settings.
	 * @param {number} round The round number; must be a positive integer.
	 * @return {number} The length of the round, in milliseconds.
	 */
	function getRoundLength(round) {
		return 120_000 + Math.min(10_000*(round-1), 60_000); // based on the game's settings;
	}

	/**
	 * Calculates the length of the safe time in a round, using the map's default settings.
	 * @param {number} round The round number; must be a positive integer.
	 * @returns {number} The length of the safe time, in milliseconds.
	 */
	function getSafeTimeLength(round) {
		if (round == 1) return 105_000;
		return Math.max(145_000 - 15_000 * round, 30_000);
	}

	/**
	 * Calculates the length of the danger time in a round, using the map's default settings.
	 * @param {number} round The round number; must be positive integer.
	 * @returns {number} The length of the danger time, in milliseconds.
	 */
	function getDangerTimeLength(round) {
		if (round < 2) return 15_000; // 2 rounds before danger time add
		return Math.min(15_000 + 25_000*(round-2), getRoundLength(round) - 30_000);
	}

	/**
	 * Converts an array of timestamps from replay time to video time.
	 * @param {Object[]} array The objects with timestamps in replay time. The timestamps are at the "ms" property; objects without that property will be ignored.
	 * @param {Object} firstValue What the value at ms=0 should become if there is no datapoint before the start of the video. The "ms" propety of this object will be set to 0.
	 * @returns {Object[]} The converted array of timestamps, in video time.
	 */
	function convertTimestamps(array, firstValue) {
		let beforeVideoStart = true;
		const result = [];
		for (let i = 0; i < array.length; i++) {

			if (typeof array[i].ms === "undefined") {
				continue;
			}
			
			if (beforeVideoStart) {
				if (array[i].ms <= videoStart) {
					firstValue = array[i];
					continue;
				}
				
				addFirstValue();
				beforeVideoStart = false;
			}
			
			if (array[i].ms >= videoEnd) {
				break;
			}
			
			result.push({ "ms": toVideoTime(array[i].ms), "value": array[i].value, "replayms": array[i].ms });
		}
		if (beforeVideoStart) {
			addFirstValue();
		}
		function addFirstValue() {
			if (typeof firstValue === "undefined") {
				throw "First timestamp is after the start of the video.";
			}
			result.push({ "ms": 0, "value": firstValue.value, "replayms": firstValue.ms });
		}
		return result;
	};

	const rounds = convertTimestamps(replaydata.rounds);
	const healths = {};
	for (let player in replaydata.healths) {
		healths[player] = convertTimestamps(replaydata.healths[player], { value: 20 });
	}

	const overlayX = 160;
	const overlayY = 90;
	const pixelSize = 3; // Changing this number scales the entire overlay, though you will need to update the background.png file by yourself
	const overlayWidth = 441 * pixelSize;
	const overlayHeight = 90 * pixelSize;

	// These paths need to be absolute because they'll go in the resulting command.
	// Also the font file path needs a lot of character escaping...
	const fontFile = path.join(__dirname, "font.ttf").replaceAll('\\', "\\\\").replaceAll(':', "\\:").replaceAll('\'', "\\'").replaceAll('\\', "\\\\");
	const backgroundFile = path.join(__dirname, `background.png`);

	// The code will sequentially add video filters to the result. The following filters are used:
	// overlay: https://ffmpeg.org/ffmpeg-all.html#overlay-1
	// split: https://ffmpeg.org/ffmpeg-all.html#split_002c-asplit
	// crop: https://ffmpeg.org/ffmpeg-all.html#crop
	// format: https://ffmpeg.org/ffmpeg-all.html#format-1
	// geq: https://ffmpeg.org/ffmpeg-filters.html#geq
	// drawtext: https://ffmpeg.org/ffmpeg-all.html#drawtext-1
	
	let result = `-i "${backgroundFile}" -filter_complex "[0:v][1]overlay=x=${overlayX}:y=${overlayY}`;

	// To make sure each output name is unique
	let outputNum = 0;

	// Health

	/**
	 * Draws the red bars on the overlay for one team
	 * @param {String[]} players The names of the players whose healths should be displayed
	 * @param {Number} x The distance between the left of the overlay background and the left of the health bar (at full health)
	 * @param {boolean} decreaseToRight True if the health bar should shrink to the right (for the away team); false if it should shrink to the left (for the home team)
	 */
	function drawTeamHealths(players, x, decreaseToRight) {

		for (let playerI = 0; playerI < players.length; playerI++) {

			//console.log(`drawing healths for ${players[playerI]}`);
			
			const playerHealths = healths[players[playerI]];
			if (playerHealths[0].value === 0) continue;

			// For health bars we first crop the part of the overlay that should be coloured red, then colour it red, then overlay it onto the video.

			const barW = playerHealths[0].value*10*pixelSize;
			const offsetX = decreaseToRight ? 200*pixelSize - barW : 0;

			// values for the geq filter
			let r = `r(X\\,Y)*4-max(max(Y-${14*pixelSize}\\,X-${196*pixelSize-offsetX})\\,0)*${24/pixelSize}`;
			let gb = `max(${3*pixelSize}-min(Y\\,X+${offsetX})\\,0)*${24/pixelSize}`;
			let a = `255`;

			// make hurt animations happen by modifying the alpha value
			const t = 18; // total duration of the hurt animation, in frames (preferably a multiple of 9)
			const f = 5103 / (4*t); // constant for in the polynomial
			let oldEdge = decreaseToRight ? 0 : barW;
			for (let i = 1; i < playerHealths.length; i++) {
				let frame = playerHealths[i].ms*60/1000; // frame when the hurt happens
				let newEdge = playerHealths[i].value*10*pixelSize; // new width of the bar
				let keepFunc, removeFunc;
				if (decreaseToRight) {
					newEdge = barW - newEdge;
					keepFunc = "gte";
					removeFunc = "lt";
				}
				else {
					keepFunc = "lt";
					removeFunc = "gte";
				}
				a += `-${keepFunc}(X\\,${oldEdge})*between(N\\,${frame}\\,if(${keepFunc}(X\\,${newEdge})\\,${frame+t}\\,${frame+t/3}))*(${f/(t*t)}*(N-${frame})^3-${2*f/t}*(N-${frame})^2+${f}*(N-${frame}))-gte(N\\,${frame+t/3})*${removeFunc}(X\\,${newEdge})*${keepFunc}(X\\,${oldEdge})*189`;
				oldEdge = newEdge;
			}
			
			const y = overlayY + (33 + playerI*19) * pixelSize;
			result += `,split[main${outputNum}][temp${outputNum}];[temp${outputNum}]crop=x=${overlayX+x+offsetX}:y=${y}:w=${barW}:h=${18*pixelSize},format=rgba,geq=r=${r}:g=${gb}:b=${gb}:a=${a}[bar${outputNum}];[main${outputNum}][bar${outputNum}]overlay=x=${overlayX+x+offsetX}:y=${y}`;

			outputNum++;
		}
	}

	drawTeamHealths(replaydata.home.players, 20*pixelSize, false);
	drawTeamHealths(replaydata.away.players, 221*pixelSize, true);

	// Team names

	/**
	 * Draws the name of a team on the overlay.
	 * @param {Object} team The team whose name to draw
	 * @param {String} x The expression for the x-coordinate to draw the text at
	 */
	function drawTeamName(team, x) {
		result += `,drawtext=text='${team.name}':x=${x}:y=${overlayY + 9*pixelSize}:fontfile=${fontFile}:fontsize=${15*pixelSize}:fontcolor=${team.colour}:shadowcolor=${team.shadow}:shadowx=${2*pixelSize}:shadowy=${2*pixelSize}`;
	}

	drawTeamName(replaydata.home, overlayX + 88*pixelSize + "-ceil(text_w/2)");
	drawTeamName(replaydata.away, overlayX + overlayWidth - 88*pixelSize + "-floor(text_w/2)");

	// Player names

	/**
	 * Creates video filters that draw the names of a team's players onto the overlay.
	 * @param {String[]} names The names of the team's players
	 * @param {String} x The expression that gives the x-coordinate to draw the text at
	 */
	function drawTeamNames(names, x) {
		for (let i = 0; i < names.length; i++) {
			result += `,drawtext=text='${names[i]}':x=${x}:y=${overlayY + (36 + i*19) * pixelSize}:fontfile=${fontFile}:fontsize=${12*pixelSize}:fontcolor=white:alpha=0.75`;
		}
	}

	drawTeamNames(replaydata.home.players, overlayX + 24*pixelSize);
	drawTeamNames(replaydata.away.players, overlayX + overlayWidth - 23*pixelSize + "-floor(text_w)");

	// Round

	for (let i = 0; i < rounds.length; i++) {
		let enableValue = i < rounds.length-1 ? `between(t,${rounds[i].ms/1000},${rounds[i+1].ms/1000})` : `gte(t,${rounds[i].ms/1000})`;

		result += `,drawtext=text='Round ${rounds[i].value}':x=floor(${overlayX+overlayWidth/2}-text_w/2):y=${overlayY+3*pixelSize}:fontfile=${fontFile}:fontsize=${12*pixelSize}:fontcolor=white:alpha=0.75:enable='${enableValue}'`;
	}

	// Timer

	// Time in the video ticks down linearly, but that line changes at every round switch and time keyframe.
	// This code loops through all of those lines, with the start and end each being either a round switch or a time keyframe.
	let roundI = 1, keyframeI = 1;
	let start = { ms: timekeyframes[0].time, replayms: timekeyframes[0].properties.timestamp };
	while (keyframeI < timekeyframes.length) {

		let roundEndReplayMs;
		if (roundI < rounds.length) {
			roundEndReplayMs = rounds[roundI].replayms;
		}
		else {
			let prevround = rounds[roundI-1];
			roundEndReplayMs = prevround.replayms + getRoundLength(+prevround.value);
		}

		let safeTimeEndReplayMs = roundEndReplayMs - getDangerTimeLength(+rounds[roundI-1].value);

		let speed = (timekeyframes[keyframeI].properties.timestamp - timekeyframes[keyframeI-1].properties.timestamp) / (timekeyframes[keyframeI].time - timekeyframes[keyframeI-1].time);
		
		let end;
		if (roundI >= rounds.length || rounds[roundI].ms > timekeyframes[keyframeI].time) {
			end = { ms: timekeyframes[keyframeI].time, replayms: timekeyframes[keyframeI].properties.timestamp };
			keyframeI++;
		}
		else {
			end = rounds[roundI];
			roundI++;
		}
		
		// Where the round end *would be* if we continued playing the video at this speed
		let roundEndVideoMs = (roundEndReplayMs - end.replayms) / speed + end.ms;
		let safeTimeEndVideoMs = (safeTimeEndReplayMs - end.replayms) / speed + end.ms;

		let roundExpression;
		let safeTimeExpression;
		if (speed === 1) {
			roundExpression = `${roundEndVideoMs/1000}-t`;
			safeTimeExpression = `${safeTimeEndVideoMs/1000}-t`;
		}
		else {
			roundExpression = `(${roundEndVideoMs/1000}-t)*${speed}`;
			safeTimeExpression = `(${safeTimeEndVideoMs/1000}-t)*${speed}`;
		}

		result += `,drawtext=text='%{eif\\:max(floor(ceil(${roundExpression})/60)\\,0)\\:d}\\:%{eif\\:mod(max(ceil(${roundExpression})\\,0)\\,60)\\:d\\:2}':fontfile=${fontFile}:fontsize=${12*pixelSize}:fontcolor=white:x=floor(${overlayX+overlayWidth/2-22*pixelSize}-text_w/2):y=${overlayY+19*pixelSize}:alpha=0.625:enable='between(t,${start.ms/1000},${end.ms/1000})'`;
		result += `,drawtext=text='%{eif\\:max(floor(ceil(${safeTimeExpression})/60)\\,0)\\:d}\\:%{eif\\:mod(max(ceil(${safeTimeExpression})\\,0)\\,60)\\:d\\:2}':fontfile=${fontFile}:fontsize=${12*pixelSize}:fontcolor=white:x=ceil(${overlayX+overlayWidth/2+22*pixelSize}-text_w/2):y=${overlayY+19*pixelSize}:alpha=0.625:enable='between(t,${start.ms/1000},${end.ms/1000})'`;

		start = end;
	}

	return result + '"'; // closing quote
}
