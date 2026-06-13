const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('toketeoAPI', {
  getBackendPort: () => {
    const portArg = process.argv.find(arg => arg.startsWith('--backend-port='));
    return portArg ? portArg.split('=')[1] : null;
  }
});

window.addEventListener('DOMContentLoaded', () => {
  console.log('Toketeo desktop preload context initialized.');
});
