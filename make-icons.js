// Generates the MelodyFlow drum icons from the same geometry the app uses.
// Run: node make-icons.js   (writes icon.svg + icon-maskable.svg)
const fs = require('fs');

const RING = ['6.','.2','7','1','5','3','7.','4','6','2','.1','.3'];
const A = '#9184d9';
const parts = p => ({ num: String(p).replace(/\./g,''), up: p[0]==='.', dn: p[p.length-1]==='.' });

function tongues(){
  const n = RING.length, w = 43, h = 80, R = 140, step = 360/n, out = [];
  const label = (cx, cy, p, fs) => {
    const q = parts(p), dot = Math.max(2.5, fs*0.13);
    let el = '';
    if (q.up) el += `<circle cx="${cx}" cy="${cy-fs*0.62}" r="${dot/2}" fill="#aeb2c2"/>`;
    el += `<text x="${cx}" y="${cy}" fill="#aeb2c2" font-family="Inter,system-ui,sans-serif" font-weight="600" font-size="${fs}" text-anchor="middle" dominant-baseline="central">${q.num}</text>`;
    if (q.dn) el += `<circle cx="${cx}" cy="${cy+fs*0.62}" r="${dot/2}" fill="#aeb2c2"/>`;
    return el;
  };
  RING.forEach((p,i) => {
    const deg = (i*step)%360, a = deg*Math.PI/180;
    const cx = 200 + R*Math.sin(a), cy = 200 - R*Math.cos(a);
    out.push(`<rect x="${cx-w/2}" y="${cy-h/2}" width="${w}" height="${h}" rx="${w/2}" transform="rotate(${deg} ${cx} ${cy})" fill="#2e3145" stroke="#15171f" stroke-width="1.2"/>`);
    out.push(label(cx, cy, p, 24));
  });
  // centre pad, lit in the accent
  out.push(`<rect x="154" y="154" width="92" height="92" rx="46" fill="${A}" stroke="#c7c0f2" stroke-width="1.4"/>`);
  out.push(`<text x="200" y="200" fill="#171927" font-family="Inter,system-ui,sans-serif" font-weight="600" font-size="30" text-anchor="middle" dominant-baseline="central">5</text>`);
  out.push(`<circle cx="200" cy="219" r="1.9" fill="#171927"/>`);
  return out.join('\n    ');
}

const shell = `
    <defs><radialGradient id="s" cx="42%" cy="30%" r="78%">
      <stop offset="0" stop-color="#31344c"/><stop offset="0.55" stop-color="#1d2030"/><stop offset="1" stop-color="#12141d"/>
    </radialGradient></defs>
    <circle cx="200" cy="200" r="196" fill="url(#s)"/>
    <circle cx="200" cy="200" r="196" fill="none" stroke="#3f424d" stroke-width="1.5"/>
    <circle cx="200" cy="200" r="183" fill="none" stroke="#2a2d3a" stroke-width="1"/>`;

const drum = shell + '\n    ' + tongues();

// plain icon — transparent corners, drum fills the frame
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">${drum}\n</svg>\n`;

// maskable — full-bleed dark ground with the drum inset to the safe area (~80%)
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <rect width="400" height="400" fill="#0f1018"/>
  <g transform="translate(200 200) scale(0.78) translate(-200 -200)">${drum}
  </g>
</svg>\n`;

fs.writeFileSync('icon.svg', icon);
fs.writeFileSync('icon-maskable.svg', maskable);
console.log('wrote icon.svg, icon-maskable.svg');
