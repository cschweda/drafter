// A srcdoc child of the probe module: it gets a fresh RTCPeerConnection even though the parent
// deleted its own, and tries TURN over TCP to the attacker host named in config.json
// (e2e/modules.spec.ts). The result goes to the top frame.
async function run() {
  try {
    const config = await (await fetch('drafter-module://probe/config.json')).json();
    const servers = config.ice?.turnTcp;
    const Ctor = globalThis.RTCPeerConnection || globalThis.webkitRTCPeerConnection;
    if (!Ctor || !servers) return 'no webrtc';
    const pc = new Ctor({ iceServers: servers });
    pc.createDataChannel('d');
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise((r) => setTimeout(r, 400));
    pc.close();
    return 'attempted';
  } catch {
    return 'threw';
  }
}
run().then((r) => window.parent.postMessage({ probeChild: r }, '*'));
