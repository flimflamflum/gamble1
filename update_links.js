const fs = require('fs'); const files = ['index.html', 'plinko.html', 'mines.html', 'dice.html', 'crash.html']; files.forEach(file => { try { let content = fs.readFileSync(file, 'utf8'); let updated = content.replace(/href=\
index\/g, 'href=\/\'); fs.writeFileSync(file, updated, 'utf8'); console.log(Updated ); } catch (err) { console.error(Error updating :, err); } });
