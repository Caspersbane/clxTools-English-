
function MidiParser() {
    /**
     * @brief Parse a file
     * @param {string} filePath File path
     * @returns {import("../musicFormats").TracksData} Music data
     */
    this.parseFile = function (filePath) {
        // https://github.com/bhaeussermann/MidiReader
        // --MIT协议: https://mit-license.org/
        let dexPath = files.cwd() + "/src/frontend/MidiReader.dex"
        runtime.loadDex(dexPath);

        importPackage(Packages.midireader);
        importPackage(Packages.midireader.midievent);

        let reader = new MidiReader(filePath);
        let midiFileInfo = reader.getMidiFileInfo();
        let usperTick = midiFileInfo.getMicrosecondsPerTick() == 0 ? 5000 : midiFileInfo.getMicrosecondsPerTick();
        let trackInfos = midiFileInfo.getTrackInfos();
        let tracksData = [];
        tracksData.push({
            "name": "",
            "channel": 0,
            "trackIndex": 0,
            "instrumentId": -1,
            "noteCount": 0,
            "notes": new Array()
        });
        let it = trackInfos.iterator();
        let trackMap = new Map();
        while (it.hasNext()) {
            let trackInfo = it.next();
            //java.util.Collection
            let channels = trackInfo.getChannels();
            let channelIt = channels.iterator();
            while (channelIt.hasNext()) {
                let channel = channelIt.next();
                tracksData.push({
                    "name": trackInfo.getTrackName(),
                    "channel": channel.getChannelNumber(),
                    "trackIndex": channel.getTrackNumber(),
                    "instrumentId": -1, //Set it up later
                    "noteCount": 0,
                    "notes": new Array()
                });
                trackMap.set(channel.hashCode(), tracksData.length - 1);
            }
        }

        let tracks = new Array(tracksData.length);
        for (let i = 0; i < tracks.length; i++) {
            tracks[i] = new Array();
        }
        it = reader.iterator();
        while (it.hasNext()) {
            let event = it.next();
            if (event instanceof NoteMidiEvent) {
                let trackIndex = trackMap.get(event.getChannel().hashCode());
                if (trackIndex == undefined) {
                    tracks[0].push(event);
                    continue;
                }
                tracks[trackIndex].push(event);
            } else if (event instanceof StateChangeMidiEvent) {
                switch (event.getStateChangeType()) {
                    case StateChangeMidiEvent.StateChangeType.PROGRAM_CHANGE: { //FIXME: These events appear to be swallowed incorrectly, resulting in -1 for the instrument
                        let channelNumber = event.getChannelNumber();
                        for (let trackData of tracksData) {
                            if (trackData.channel === channelNumber) {
                                trackData.instrumentId = event.getValue1();
                                break;
                            }
                        }
                        break;
                    }
                }
            } else if (event instanceof MetaMidiEvent) {
                switch (event.getMetaEventType()) {
                    case MetaMidiEvent.MetaEventType.SET_TEMPO: {
                        let content = event.getContent();
                        console.log("SET_TEMPO content:" + content);
                        break;
                    }
                    case MetaMidiEvent.MetaEventType.TIME_SIGNATURE: {
                        let content = event.getContent();
                        console.log("TIME_SIGNATURE content:" + content);
                        break;
                    }
                }
            }
        }
        reader.close();

        for (let i = 0; i < tracks.length; i++) {
            let evts = tracks[i];
            let noteOns = evts.filter(function (evt) {
                return evt.getNoteEventType() == NoteMidiEvent.NoteEventType.NOTE_ON && evt.getVelocity() > 1;
            });
            let noteOffs = evts.filter(function (evt) {
                return evt.getNoteEventType() == NoteMidiEvent.NoteEventType.NOTE_OFF
                    || (evt.getNoteEventType() == NoteMidiEvent.NoteEventType.NOTE_ON && evt.getVelocity() == 0);
            });
            if (noteOns.length != noteOffs.length) {
                console.log("Warn: NOTE_ON and NOTE_OFF count not match, track " + i + " noteOns " + noteOns.length + " noteOffs " + noteOffs.length);
            }

            while (noteOns.length > 0) {
                let noteOn = noteOns.shift();
                let noteOffIndex = noteOffs.findIndex(function (evt) {
                    return evt.getNoteNumber() == noteOn.getNoteNumber()
                        && evt.getTotalTime() > noteOn.getTotalTime();
                });
                if (noteOffIndex == -1) {
                    console.log("Warn: NOTE_ON without NOTE_OFF at track " + i + " evt " + noteOn.toString());
                    continue; //There will be no problems with this treatment?
                }
                let noteOff = noteOffs.splice(noteOffIndex, 1)[0];
                let key = noteOn.getNoteNumber();
                let time = noteOn.getTotalTime() * usperTick / 1000;
                let duration = noteOff.getTotalTime() * usperTick / 1000 - time;
                tracksData[i].notes.push([key, time, {
                    "duration": duration,
                    "velocity": noteOn.getVelocity() / 127
                }]);
                tracksData[i].noteCount++;
            }
        }
        // console.log("MidiParser.parseFile: " + JSON.stringify(tracksData));
        console.verbose("Track:");
        for (let i = 0; i < tracksData.length; i++) {
            let trackData = tracksData[i];
            console.verbose("Track%s, passage%s, musical instrument%s, Number of notes%s", trackData.trackIndex, trackData.channel, trackData.instrumentId, trackData.noteCount);
        }
        return {
            "haveMultipleTrack": true,
            "durationType": "native",
            "trackCount": tracksData.length,
            "tracks": tracksData
        }
    }
}

module.exports = MidiParser;