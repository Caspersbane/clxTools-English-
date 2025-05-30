const MusicFormats = require("../musicFormats");
const { Midi } = require('@tonejs/midi')
const fs = require('fs');
const ToneJsJSONParser = require('../frontend/ToneJsJSON');

function MusicReader() {
    let musicFormats = new MusicFormats();
    /**
     * @brief Parse the file
     * @param {string} filePath File path
     * @param {string?} forcedFormatName Enforce the format
     * @returns {import("../musicFormats").TracksData}
     */
    this.parseFile = function (filePath, forcedFormatName) {
        let fileFormat = forcedFormatName ? forcedFormatName : musicFormats.getFileFormat(filePath).name;
        switch (fileFormat) {
            case "tonejsjson":
            case "domiso":
            case "skystudiojson":
                try {
                    let str = fs.readFileSync(filePath, 'utf8');
                    return musicFormats.parseFromString(str, fileFormat);
                } catch {
                    let str = fs.readFileSync(filePath, 'utf-16le').trim();
                    return musicFormats.parseFromString(str, fileFormat);
                }
            case "midi":
                const midi = new Midi(fs.readFileSync(filePath));
                return new ToneJsJSONParser().parseFromJSON(midi.toJSON());
            default:
                throw new Error("Unsupported file formats");
        }
    }
}

module.exports = {
    MusicReader
}