/** Skip native rebuild + node_modules walk; the app is already bundled into out/. */
module.exports = async function beforeBuild() {
  return false
}
