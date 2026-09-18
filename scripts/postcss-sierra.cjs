// Use supported viewport variables even inside custom properties. Merely adding
// duplicate declarations fails when an unsupported unit is stored in a variable.
module.exports = () => ({
  postcssPlugin: 'emove-sierra-viewport',
  Declaration(decl) {
    if (decl.prop.startsWith('--emove-')) return;
    decl.value = decl.value.replace(/(-?(?:\d*\.)?\d+)([sdl])v([wh])\b/g,
      (_, amount, kind, axis) => `calc(${amount} * var(--emove-${kind}v${axis}))`);
  },
});
module.exports.postcss = true;
