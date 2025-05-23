var configuration = require('./configuration');
let MusicFormats = require("./musicFormats");
let ChimomoApi = require("./cloud/chimomoApi");

function FileProvider() {
    const musicDir = configuration.getMusicDir();
    const tmpSubDir = "tmp/";
    files.ensureDir(musicDir + tmpSubDir);
    const musicFormats = new MusicFormats();
    const userMusicListsKey = "config_userMusicLists";

    const chimomoApi = new ChimomoApi();
    const chimomoApiMusicListKey = "config_chimomoapi_musicList";
    const chimomoApiFileEntryPrefix = "cloud:chimomoapi";

    const cloudCacheTTLMs = 1000 * 60 * 60 * 24; // 24 hours

    /**
     * @typedef {Object} UserMusicList
     * @property {string} name - Song single name
     * @property {Array<string>} musicFiles - A list of music files in a playlist
     */

    let userMusicLists = /** @type {Array<UserMusicList>} */ (configuration.getJsonFromFile("config_userMusicLists"));
    if (!userMusicLists) {
        userMusicLists = [
            {
                name: "collection",
                musicFiles: []
            },
        ];
    }
    configuration.setJsonToFile(userMusicListsKey, userMusicLists);

    this.userMusicLists = userMusicLists;

    function tryListMusicFilesInsideZip(zipPath, charSet) {
        let fileList = [];
        const zip = new java.util.zip.ZipFile(zipPath, java.nio.charset.Charset.forName(charSet));
        const entries = zip.entries();
        while (entries.hasMoreElements()) {
            let entry = entries.nextElement();
            let entryName = String(entry.getName());
            if (!entry.isDirectory() && musicFormats.isMusicFile(entryName)) {
                fileList.push(entryName);
            }
        }
        zip.close();
        return fileList;
    }

    function listMusicFilesInsideZip(zipPath) {
        const charSets = ['UTF-8', 'GBK'];
        const fileCharSet = configuration.readFileConfig("zipFileCharSet", zipPath);
        if (fileCharSet) {
            return tryListMusicFilesInsideZip(zipPath, fileCharSet);
        }

        for (let charSet of charSets) {
            try {
                let res = tryListMusicFilesInsideZip(zipPath, charSet);
                configuration.setFileConfig("zipFileCharSet", charSet, zipPath);
                return res;
            } catch (e) {
                console.error(`Failed to list music files inside zip file ${zipPath} with charset ${charSet}: ${e}`);
            }
        }
        throw new Error(`Zip file ${zipPath} The encoding of the file name within is unknown, and the read failed! (Try unzipping on your computer and then recompressing)`);
    }

    /**
     * Extract music files from zip files to a temporary directory
     * @param {string} zipName - zip file name
     * @param {string} musicName - The name of the music file
     * @returns {string?} - Returns the path of the music file relative to the music directory (e.g. "tmp/xxx.mid"), or null if the extraction fails
     */
    this.extractMusicFromZip = function (zipName, musicName) {
        const zipPath = musicDir + zipName;
        const tmpPath = musicDir + tmpSubDir + musicName;
        const fileCharSet = configuration.readFileConfig("zipFileCharSet", zipPath);
        files.ensureDir(tmpPath);
        const zip = new java.util.zip.ZipFile(zipPath, java.nio.charset.Charset.forName(fileCharSet));
        const entries = zip.entries();
        while (entries.hasMoreElements()) {
            let entry = entries.nextElement();
            let entryName = String(entry.getName());
            if (entryName === musicName) {
                let inputStream = zip.getInputStream(entry);
                let outputStream = new java.io.FileOutputStream(tmpPath);
                let buffer = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, 1024);
                let count;
                while ((count = inputStream.read(buffer)) != -1) {
                    outputStream.write(buffer, 0, count);
                }
                inputStream.close();
                outputStream.close();
                zip.close();
                return tmpSubDir + musicName;
            }
        }
        zip.close();
        return null;
    }

    /**
     * Read a list of all music files placed directly in the music folder
     * @returns {Array<string>} - Returns a list of music files, such as["music1.mid", "music2.mid"]
     */
    this.listDiscreteMusicFiles = function () {
        return files.listDir(musicDir, function (name) {
            return files.isFile(files.join(musicDir, name)) && musicFormats.isMusicFile(name);
        });
    }

    /**
     * Read a list of music files in all zip files
     * @returns {Array<string>} - Returns a list of music files, e.g. ["1.zip/music1.mid", "2.zip/music2.mid"]
     */
    this.listAllZippedMusicFiles = function () {
        return files.listDir(musicDir, function (name) {
            return files.isFile(files.join(musicDir, name)) && name.endsWith(".zip");
        }).map(function (name) {
            return listMusicFilesInsideZip(musicDir + name).map(function (musicName) {
                return name + "/" + musicName;
            });
        }).reduce(function (acc, val) {
            return acc.concat(val);
        }, []);
    }

    /**
     * Read a list of all your music files in the cloud
     * @returns {Array<string>} - Returns a list of music files, such as["cloud:chimomoapi/1.json", "cloud:chimomoapi/2.json"]
     */
    this.listAllCloudMusicFiles = function () {
        const cloudMusicList = configuration.getJsonFromFile(chimomoApiMusicListKey) || [];
        return cloudMusicList.map(function (entry) {
            return chimomoApiFileEntryPrefix + "/" + entry.name + ".json";
        });
    };

    /**
     * Load the music files in the cloud and extract them to a temporary directory
     * @param {string} musicName - The name of the music file
     * @param {(err: Error?, succeeded: boolean) => void} callback - Callback function
     */
    this.loadCloudMusicFile = function (musicName, callback) {
        const nameParts = musicName.split("/");
        if (nameParts[0] === chimomoApiFileEntryPrefix) {
            /**
             * @type {import('./cloud/chimomoApi').ChimomoApiFileEntry[]}
             */
            const json = configuration.getJsonFromFile(chimomoApiMusicListKey);
            const musicEntry = json.find(entry => entry.name + ".json" === nameParts[1]);
            const tmpPath = musicDir + tmpSubDir + musicEntry.name + ".json";
            if (musicEntry) {
                const id = musicEntry.id;
                console.log(`Start fetching cloud music file(chimomoapi): name=${musicEntry.name}, id=${id}`);
                chimomoApi.fetchMusicFileById(id, (err, data) => {
                    if (err) {
                        console.error("Failed to fetch cloud music file(chimomoapi): " + err);
                        if (callback) {
                            callback(err, false);
                        }
                        return;
                    }
                    console.log("Fetched cloud music file(chimomoapi): " + musicEntry.name);
                    files.write(tmpPath, JSON.stringify(data));
                    if (callback) {
                        callback(null, true);
                    }
                });
            }
        }
    }

    /**
     * Load cloud music files from a temporary directory
     * @param {string} musicName - The name of the music file
     * @returns {string?} - Returns the music file path, or null if the load fails
     * //TODO: Cache expiration/refresh mechanism?
     */
    this.loadCloudMusicFileFromTmp = function (musicName) {
        const nameParts = musicName.split("/");
        const tmpPath = musicDir + tmpSubDir + nameParts[1];
        if (files.exists(tmpPath)) {
            return tmpSubDir + nameParts[1];
        }
        return null;
    }

    /**
     * A list of cached music files
     * @type {Array<string>}
     */
    let cachedAllMusicFiles = []

    /**
     * Read a list of all your music files
     * @returns {Array<string>} - Back to the list of music files, 如["music1.mid", "music2.mid", "1.zip/music1.mid", "2.zip/music2.mid", "cloud:chimomoapi/1.json", "cloud:chimomoapi/2.json"]
     */
    this.listAllMusicFiles = function () {
        cachedAllMusicFiles = this.listDiscreteMusicFiles()
            .concat(this.listAllZippedMusicFiles())
            .concat(this.listAllCloudMusicFiles());
        return cachedAllMusicFiles;
    }

    /**
     * Reads a list of all music files, but this one has a cache
     * @returns {Array<string>} - Returns a list of music files, such as["music1.mid", "music2.mid", "1.zip/music1.mid", "2.zip/music2.mid", "cloud:chimomoapi/1.json", "cloud:chimomoapi/2.json"]
     */
    this.listAllMusicFilesWithCache = function () {
        if (cachedAllMusicFiles.length === 0) {
            return this.listAllMusicFiles();
        }
        return cachedAllMusicFiles;
    }

    /**
     * Clear the cache
     */
    this.refreshAllMusicFilesListCache = function () {
        cachedAllMusicFiles = [];
    }

    /**
     * Update the cloud music list
     * @param {(err: Error?, succeeded: boolean) => void} [callback] - Callback function
     * @param {boolean} [force] - Whether to force a flush (ignore cache)
     */
    this.updateCloudMusicList = function (callback, force) {
        let chimomoApiLastUpdate = configuration.getJsonFileLastModifiedTime(chimomoApiMusicListKey);
        if (force || chimomoApiLastUpdate === null || Date.now() - chimomoApiLastUpdate > cloudCacheTTLMs) {
            console.log("Start fetching cloud music list (chimpomoapi)");
            chimomoApi.fetchMusicList(0, 10000, null, (err, data) => {
                if (err) {
                    console.error("Failed to fetch cloud music list(chimomoapi): " + err);
                    if (callback)
                        callback(err, false);
                    return;
                }
                console.log("Fetched cloud music list(chimomoapi):");
                configuration.setJsonToFile(chimomoApiMusicListKey, data);
                if (callback)
                    callback(null, true);
            });
        } else {
            console.log("Skip fetching cloud music list(chimomoapi)");
            if (callback)
                callback(null, true);
        }
    }

    /**
     * Load the music file. If the file is inside a zip file, it is extracted to a temporary directory, otherwise the file path is returned directly
     * @param {string} musicName - The name of the music file
     * @returns {string?} - Returns the music file path, or null if the load fails
     * @example 
     * // load disk.mid
     * fileProvider.loadMusicFile("disk.mid") -> "disk.mid"
     * // 加载 1.zip/disk.mid
     * fileProvider.loadMusicFile("1.zip/disk.mid") -> "tmp/disk.mid"
     * @note For music files in the cloud, you need to call loadCloudMusicFile to download the files locally!
     */
    this.loadMusicFile = function (musicName) {
        const nameParts = musicName.split("/");
        if (nameParts[0].endsWith(".zip")) {
            return this.extractMusicFromZip(nameParts[0], nameParts.slice(1).join("/"));
        } else if (nameParts[0].startsWith(chimomoApiFileEntryPrefix)) {
            return this.loadCloudMusicFileFromTmp(musicName);
        } else {
            return musicName;
        }
    }

    /**
     * Clear the music file cache
     */
    this.clearMusicFileCache = function () {
        files.removeDir(musicDir + tmpSubDir);
        files.ensureDir(musicDir + tmpSubDir);
    }

    /**
     * Save playlist data to a configuration file
     * @private
     */
    function saveUserMusicLists() {
        configuration.setJsonToFile(userMusicListsKey, userMusicLists);
    }

    /**
     * Create a new playlist
     * @param {string} name - The name of the playlist
     * @returns {boolean} - Returns true if the creation succeeds, or false otherwise
     */
    this.createMusicList = function (name) {
        if (userMusicLists.some(list => list.name === name)) {
            return false;
        }
        userMusicLists.push({ name: name, musicFiles: [] });
        saveUserMusicLists();
        return true;
    }

    /**
     * Delete a playlist
     * @param {string} name - The name of the playlist
     * @returns {boolean} - Returns true if the deletion is successful, false otherwise
     */
    this.deleteMusicList = function (name) {
        const initialLength = userMusicLists.length;
        userMusicLists = userMusicLists.filter(list => list.name !== name);
        if (userMusicLists.length < initialLength) {
            saveUserMusicLists();
            return true;
        }
        return false;
    }

    /**
     * Rename the playlist
     * @param {string} oldName - The name of the original playlist
     * @param {string} newName - The name of the new playlist
     * @returns {boolean} - Returns true if the rename is successful, false otherwise
     */
    this.renameMusicList = function (oldName, newName) {
        if (userMusicLists.some(list => list.name === newName)) {
            return false;
        }
        const list = userMusicLists.find(list => list.name === oldName);
        if (list) {
            list.name = newName;
            saveUserMusicLists();
            return true;
        }
        return false;
    }

    /**
     * Add songs to playlists
     * @param {string} listName - The name of the playlist
     * @param {string} musicFile - The file name of the song
     * @returns {boolean} - Returns true if the addition is successful, false otherwise
     */
    this.addMusicToList = function (listName, musicFile) {
        const list = userMusicLists.find(list => list.name === listName);
        if (list && !list.musicFiles.includes(musicFile)) {
            list.musicFiles.push(musicFile);
            saveUserMusicLists();
            return true;
        }
        return false;
    }

    /**
     * Delete a song from a playlist
     * @param {string} listName - The name of the playlist
     * @param {string} musicFile - The file name of the song
     * @returns {boolean} - Returns true if the deletion is successful, false otherwise
     */
    this.removeMusicFromList = function (listName, musicFile) {
        const list = userMusicLists.find(list => list.name === listName);
        if (list) {
            const initialLength = list.musicFiles.length;
            list.musicFiles = list.musicFiles.filter(file => file !== musicFile);
            if (list.musicFiles.length < initialLength) {
                saveUserMusicLists();
                return true;
            }
        }
        return false;
    }

    /**
     * Lists the songs in the playlist
     * @param {string} listName - The name of the playlist
     * @returns {Array<string>|null} - Returns a list of songs, or null if the playlist does not exist
     */
    this.listMusicInList = function (listName) {
        const list = userMusicLists.find(list => list.name === listName);
        return list ? list.musicFiles : null;
    }

    /**
     * Make a list of all playlists
     * @returns {Array<string>} - Returns an array of all playlist names
     */
    this.listAllMusicLists = function () {
        return userMusicLists.map(list => list.name);
    }

    /**
     * Get playlists
     * @param {string} listName - The name of the playlist
     * @returns {UserMusicList|null} - Returns a playlist object, or null if it doesn't exist
     */
    this.getMusicList = function (listName) {
        return userMusicLists.find(list => list.name === listName) || null;
    }
}

module.exports = FileProvider;
