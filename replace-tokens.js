const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('d:/bountied/src');
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  if (content.includes('text-money')) { content = content.replace(/text-money/g, 'text-emerald-500'); changed = true; }
  if (content.includes('bg-money')) { content = content.replace(/bg-money/g, 'bg-emerald-500'); changed = true; }
  if (content.includes('text-accent-dim')) { content = content.replace(/text-accent-dim/g, 'text-muted-foreground'); changed = true; }
  if (content.includes('text-accent')) { content = content.replace(/text-accent/g, 'text-primary'); changed = true; }
  if (content.includes('bg-accent-dim')) { content = content.replace(/bg-accent-dim/g, 'bg-primary/80'); changed = true; }
  if (content.includes('bg-accent')) { content = content.replace(/bg-accent/g, 'bg-primary'); changed = true; }
  
  if (changed) {
    fs.writeFileSync(file, content);
  }
});
