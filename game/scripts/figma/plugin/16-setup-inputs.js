// In-place patch from validation pass 3. Idempotent.
//  A. Setup card: the Start row fills the card width so "Start game" is centred (.row-btns justify-content: center).
//  B. Text input: a native <input> is one line and clips — Value text truncates instead of wrapping.
/*LIB*/
/*SCREENS*/
const done = [];
let rows = 0;
for (const v of COMP['Setup card'].children) {
  const start = v.children.find((n) => n.name === 'Start');
  if (start && start.layoutSizingHorizontal !== 'FILL') { start.layoutSizingHorizontal = 'FILL'; start.primaryAxisAlignItems = 'CENTER'; rows++; }
}
done.push(`A: ${rows} setup start rows centred`);
await Promise.all(['Regular', 'Medium', 'SemiBold', 'Bold'].map((style) => figma.loadFontAsync({ family: FONT, style })));
let texts = 0;
for (const v of COMP['Text input'].children) {
  const t = v.findOne((n) => n.type === 'TEXT');
  if (t) { t.textAutoResize = 'HEIGHT'; t.maxLines = 1; t.textTruncation = 'ENDING'; texts++; }
}
done.push(`B: ${texts} input texts single-line + ellipsis`);
return { done };
