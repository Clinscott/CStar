const fs = require('fs');
const sourceMap = require('source-map');

(async () => {
    const mapRaw = fs.readFileSync('dist/pennyone-vis/assets/index-Blt_gY0K.js.map', 'utf8');
    const consumer = await new sourceMap.SourceMapConsumer(mapRaw);
    const pos = consumer.originalPositionFor({ line: 4062, column: 5383 });
    console.log(pos);
})();
