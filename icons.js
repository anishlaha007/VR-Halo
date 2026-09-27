// Icons that sit inside a sound's wave, in the dome that marks its direction.
// Each is an SVG path on a 24×24 grid, filled with the even-odd rule, so a shape drawn inside
// another becomes a hole (the clock's hands, the bus's windscreen). The same paths draw on the
// canvas (halo.js) and in pages (iconSvg).
// To add one: draw it on a 24×24 grid, add it here, then name it as a sound's `icon` in common.js.
const circle = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;

export const ICONS = {
  // alarm clock: round face with hands, two bells, a hammer and feet
  alarm: circle(12, 13.5, 7.2) + 'M11.2 9.3h1.6v5h-1.6zM12.8 12.7h3.2v1.6h-3.2z'
    + 'M4.18 9.42A3 3 0 0 1 8.42 5.18zM15.58 5.18A3 3 0 0 1 19.82 9.42zM10.9 4.4h2.2v1.5h-2.2z'
    + 'M6 21.8l1.4-2.1 1.2.8-1.4 2.1zM18 21.8l-1.4-2.1-1.2.8 1.4 2.1z',
  // police light on its base, flashing both ways
  siren: 'M7 16v-5a5 5 0 0 1 10 0v5zM11 9h2v5h-2zM5 17h14v2.5H5z'
    + 'M2.3 7.2l.8-1.2 2.4 1.8-.8 1.2zM1.5 11.6h3.2V13H1.5zM21.7 7.2l-.8-1.2-2.4 1.8.8 1.2zM19.3 11.6h3.2V13h-3.2z',
  // car horn: a flared horn with sound coming out
  horn: 'M2.5 10.2h4.5l7.5-5.2c.6-.4 1.5 0 1.5.8v12.4c0 .8-.9 1.2-1.5.8L7 13.8H2.5z'
    + 'M18.5 8.4l2.4-1.6.8 1.2-2.4 1.6zM19 11.3h3v1.4h-3zM18.5 15.6l.8-1.2 2.4 1.6-.8 1.2z',
  // truck / train air horn: twin trumpets on one pipe
  airhorn: 'M2.5 6.5h4l9-3v7l-9-2h-4zM2.5 14h6l9-3v8l-9-3h-6zM3.2 8.5h1.4V14H3.2z'
    + 'M18.5 5.8h3v1.4h-3zM20 14.3h2.5v1.4H20z',
  // bicycle bell on the handlebar
  bikebell: 'M5 15A7 7 0 0 1 19 15zM4 16h16v1.8H4zM11 17.8h2V20h-2zM3 20h18v1.8H3z' + circle(12, 6.6, 1)
    + 'M19.3 13.2l2.7-1.4.6 1.2-2.7 1.4z',
  // bus, from the front
  bus: 'M7 2.5h10a3 3 0 0 1 3 3V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5.5a3 3 0 0 1 3-3z'
    + 'M6.5 6h11a.8.8 0 0 1 .8.8v4.6a.8.8 0 0 1-.8.8h-11a.8.8 0 0 1-.8-.8V6.8a.8.8 0 0 1 .8-.8zM9 3.6h6v1.2H9z'
    + circle(7.8, 15.2, 1.4) + circle(16.2, 15.2, 1.4)
    + 'M5.5 19.4h3v1.8a.8.8 0 0 1-.8.8H6.3a.8.8 0 0 1-.8-.8zM15.5 19.4h3v1.8a.8.8 0 0 1-.8.8h-1.4a.8.8 0 0 1-.8-.8z'
    + 'M2 7h1.4v3.5H2zM20.6 7H22v3.5h-1.4z',
  // someone talking
  speech: 'M4 4.5h16a2 2 0 0 1 2 2V15a2 2 0 0 1-2 2h-8.5L6 21v-4H4a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2z'
    + circle(7.5, 10.75, 1.4) + circle(12, 10.75, 1.4) + circle(16.5, 10.75, 1.4),
  // doorbell / chime
  bell: 'M12 2.8a1.5 1.5 0 0 1 1.5 1.5V5A6 6 0 0 1 18 10.8v4.4l2 2.6H4l2-2.6v-4.4A6 6 0 0 1 10.5 5v-.7A1.5 1.5 0 0 1 12 2.8z'
    + circle(12, 20, 1.9),
  // crackling leaves, snapping twigs
  leaf: 'M20 3.5C11 3.5 4.5 8 4.5 15c0 1.3.3 2.5.8 3.5L3 20.8 4.2 22l2.3-2.3c1 .5 2.2.8 3.5.8 7.2 0 10-6.5 10-15z'
    + 'M8.2 17.3C10.3 13.6 13 10.6 16.6 8l.9 1.1c-3.4 2.5-6 5.4-8 9z',
  // music, voices in a room: ambient sound
  music: 'M9 5.5l11-2.5v12a3 3 0 1 1-2-2.83V7.6l-7 1.6V17a3 3 0 1 1-2-2.83z',
  // an ear: something heard, not yet known
  ear: 'M12.5 2.5c-4.1 0-7 3-7 7 0 1 .7 1.7 1.6 1.7s1.6-.7 1.6-1.7c0-2.2 1.6-3.8 3.8-3.8s3.8 1.6 3.8 3.8c0 1.7-.8 2.6-2 3.7'
    + '-1.3 1.1-2.4 2.4-2.4 4.6 0 1.3-.9 2.2-2.1 2.2-.9 0-1.6-.5-2-1.3-.4-.8-1.4-1.1-2.2-.7-.8.4-1.1 1.4-.7 2.2.9 1.8 2.8 3 4.9 3'
    + ' 3 0 5.3-2.4 5.3-5.4 0-1 .5-1.5 1.4-2.3 1.3-1.2 3-2.8 3-6 0-4-3-7-7-7z',
};

// Inline SVG for pages. It takes the text colour (currentColor), so style it with `color`.
export const iconSvg = (name) => ICONS[name] ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${ICONS[name]}"/></svg>` : '';

// Path2D for the canvas, made once per icon.
const paths = {};
export const iconPath = (name) => ICONS[name] ? (paths[name] ??= new Path2D(ICONS[name])) : null;
