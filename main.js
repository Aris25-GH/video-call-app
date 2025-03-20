const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startCallButton = document.getElementById('startCall');
const endCallButton = document.getElementById('endCall');

let localStream;
let remoteStream;
let peerConnection;
let signalingSocket;
let localKeyPair;
let remotePublicKey;

// WebSocket signaling server URL
const signalingServerUrl = 'ws://localhost:8080';

// WebRTC configuration
const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Initialize WebSocket connection
function initSignaling() {
    signalingSocket = new WebSocket(signalingServerUrl);

    signalingSocket.onmessage = async (message) => {
        const data = JSON.parse(message.data);

        if (data.type === 'offer') {
            await handleOffer(data.offer);
        } else if (data.type === 'answer') {
            await handleAnswer(data.answer);
        } else if (data.type === 'candidate') {
            await handleCandidate(data.candidate);
        } else if (data.type === 'key') {
            remotePublicKey = new Uint8Array(Object.values(data.key));
        }
    };
}

// Start the call
startCallButton.addEventListener('click', async () => {
    startCallButton.disabled = true;
    endCallButton.disabled = false;

    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    peerConnection = new RTCPeerConnection(configuration);

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => {
        remoteStream = event.streams[0];
        remoteVideo.srcObject = remoteStream;
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            signalingSocket.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
        }
    };

    // Generate encryption keys
    localKeyPair = nacl.box.keyPair();
    signalingSocket.send(JSON.stringify({ type: 'key', key: Array.from(localKeyPair.publicKey) }));

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    signalingSocket.send(JSON.stringify({ type: 'offer', offer: offer }));
});

// End the call
endCallButton.addEventListener('click', () => {
    endCall();
});

// Handle incoming offer
async function handleOffer(offer) {
    if (!peerConnection) {
        peerConnection = new RTCPeerConnection(configuration);
        peerConnection.ontrack = (event) => {
            remoteStream = event.streams[0];
            remoteVideo.srcObject = remoteStream;
        };
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                signalingSocket.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
            }
        };
    }

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    signalingSocket.send(JSON.stringify({ type: 'answer', answer: answer }));
}

// Handle incoming answer
async function handleAnswer(answer) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

// Handle incoming ICE candidate
async function handleCandidate(candidate) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
}

// End the call
function endCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    startCallButton.disabled = false;
    endCallButton.disabled = true;
}

// Initialize signaling when the page loads
initSignaling();
