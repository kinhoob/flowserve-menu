import fs from "node:fs";
const identity = JSON.parse(
  fs.readFileSync(new URL("../src/components/brand/identity.json", import.meta.url), "utf8"),
);
const folder = new URL("../public/brand/", import.meta.url);
fs.mkdirSync(folder, { recursive: true });
const mark = () =>
  identity.mark
    .map((d) => '<path fill="' + identity.gold + '" fill-rule="evenodd" d="' + d + '"/>')
    .join("");
const { word, menu } = identity;
function letters(x, y, fill) {
  return (
    '<g fill="' +
    fill +
    '" transform="translate(' +
    x +
    " " +
    y +
    ')"><path transform="translate(' +
    -word.x +
    " " +
    -word.y +
    ')" d="' +
    word.d +
    '"/><path transform="translate(' +
    (word.w + 24 - menu.x) +
    " " +
    (word.h - menu.y - menu.h) +
    ')" d="' +
    menu.d +
    '"/></g>'
  );
}
function svg(w, h, content, bg, title) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    w +
    '" height="' +
    h +
    '" viewBox="0 0 ' +
    w +
    " " +
    h +
    '" role="img" aria-label="' +
    title +
    '"><title>' +
    title +
    "</title>" +
    (bg ? '<path fill="' + bg + '" d="M0 0H' + w + "V" + h + 'H0Z"/>' : "") +
    content +
    "</svg>\n"
  );
}
const bell =
  '<g fill="' +
  identity.gold +
  '" transform="rotate(-5 128 128)"><rect x="107" y="42" width="46" height="15" rx="7.5"/><path d="M123 54H137V65H123Z"/><path d="M41 166C41 108 80 65 129 65S218 108 218 166Q218 175 208 176H51Q41 176 41 166Z"/><rect x="29" y="184" width="199" height="18" rx="9"/><rect x="18" y="209" width="222" height="20" rx="10"/><g fill="#090909"><ellipse cx="102" cy="133" rx="5" ry="7"/><ellipse cx="158" cy="133" rx="5" ry="7"/></g><path d="M116 150Q130 165 145 150" stroke="#090909" stroke-width="7" stroke-linecap="round" fill="none"/></g>';
for (const [theme, bg, fg] of [
  ["escuro", "#090909", "#FFFFFF"],
  ["claro", "#FFFFFF", "#090909"],
]) {
  const horizontal =
    '<g transform="translate(55 65) scale(.9)">' + mark() + "</g>" + letters(515, 116, fg);
  const vertical =
    '<g transform="translate(282 75)">' +
    mark() +
    "</g>" +
    letters((1000 - word.w - 24 - menu.w) / 2, 485, fg);
  for (const [name, w, h, content] of [
    ["horizontal", 1400, 400, horizontal],
    ["vertical", 1000, 800, vertical],
    ["simbolo", 600, 460, '<g transform="translate(80 80)">' + mark() + "</g>"],
    ["mascote-campainha", 512, 512, '<g transform="scale(2)">' + bell + "</g>"],
  ]) {
    for (const transparent of [false, true])
      fs.writeFileSync(
        new URL(
          "flux-" + name + "-" + theme + (transparent ? "-transparente" : "") + ".svg",
          folder,
        ),
        svg(w, h, content, transparent ? null : bg, "Flux Menu — " + name + " " + theme),
      );
  }
}
fs.writeFileSync(
  new URL("../public/favicon.svg", import.meta.url),
  svg(
    512,
    512,
    '<g transform="translate(36 106) scale(1.04)">' + mark() + "</g>",
    null,
    "Flux Menu",
  ),
);
console.log("Identidade QR regenerada: 16 SVGs e favicon.");
