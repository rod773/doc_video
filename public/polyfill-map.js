// Polyfill for Map.prototype.getOrInsertComputed (TC39 proposal)
// Used by pdfjs-dist 5.x
if (typeof Map !== 'undefined' && !Map.prototype.getOrInsertComputed) {
  Map.prototype.getOrInsertComputed = function getOrInsertComputed(key, callbackfn) {
    if (this.has(key)) {
      return this.get(key);
    }
    var value = callbackfn(key);
    this.set(key, value);
    return value;
  };
}
