const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.cloudmason');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const LEGACY_PATH = path.resolve(__dirname, '..', '..', 'org.txt');

exports.read = function () {
    if (fs.existsSync(CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
    if (fs.existsSync(LEGACY_PATH)) {
        const [name, region] = fs.readFileSync(LEGACY_PATH, 'utf-8').split(',');
        const cfg = { name, region };
        exports.write(cfg);
        try { fs.unlinkSync(LEGACY_PATH); } catch (_) {}
        return cfg;
    }
    return null;
};

exports.write = function (cfg) {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
};
