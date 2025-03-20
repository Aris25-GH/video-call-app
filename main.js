const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startCallButton = document.getElementById('startCall');
const endCallButton = document.getElementById('endCall');
const userIdInput = document.getElementById('userId');
const remoteUserIdInput = document.getElementById('remoteUserId');
const copyUserIdButton = document.getElementById('copyUserId');
const muteAudioButton = document.getElementById('muteAudio');
const muteVideoButton = document.getElementById('muteVideo');
const volumeControl = document.getElementById('volumeControl');

let localStream;
let remoteStream;
let peerConnection;
let signalingSocket;
let localKeyPair;
let remotePublicKey;
let userId;

// Render signaling server URL (secure WebSocket over 443)
const signalingServerUrl = 'wss://video-call-app-pizq.onrender.com';

// WebRTC configuration
const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Generate a unique user ID
function generateUserId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Initialize WebSocket connection
function initSignaling() {
    signalingSocket = new WebSocket(signalingServerUrl);

    signalingSocket.onmessage = async (message) => {
        const data = JSON.parse(message.data);

        if (data.type === 'offer') {
            // Show incoming call alert
            const acceptCall = confirm(`Incoming call from ${data.senderId}. Do you want to accept?`);
            if (acceptCall) {
                await handleOffer(data.offer, data.senderId);
            }
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
    const remoteUserId = remoteUserIdInput.value;
    if (!remoteUserId) {
        alert('Please enter a remote user ID.');
        return;
    }

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
            signalingSocket.send(JSON.stringify({
                type: 'candidate',
                candidate: event.candidate,
                recipientId: remoteUserId
            }));
        }
    };

    // Generate encryption keys
    localKeyPair = nacl.box.keyPair();
    signalingSocket.send(JSON.stringify({
        type: 'key',
        key: Array.from(localKeyPair.publicKey),
        recipientId: remoteUserId
    }));

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    signalingSocket.send(JSON.stringify({
        type: 'offer',
        offer: offer,
        senderId: userId,
        recipientId: remoteUserId
    }));
});

// End the call
endCallButton.addEventListener('click', () => {
    endCall();
});

// Handle incoming offer
async function handleOffer(offer, senderId) {
    if (!peerConnection) {
        peerConnection = new RTCPeerConnection(configuration);
        peerConnection.ontrack = (event) => {
            remoteStream = event.streams[0];
            remoteVideo.srcObject = remoteStream;
        };
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                signalingSocket.send(JSON.stringify({
                    type: 'candidate',
                    candidate: event.candidate,
                    recipientId: senderId
                }));
            }
        };
    }

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    signalingSocket.send(JSON.stringify({
        type: 'answer',
        answer: answer,
        recipientId: senderId
    }));
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

// Copy user ID to clipboard
copyUserIdButton.addEventListener('click', () => {
    userIdInput.select();
    document.execCommand('copy');
    alert('User ID copied to clipboard!');
});

// Mute/unmute audio
muteAudioButton.addEventListener('click', () => {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack.enabled) {
        audioTrack.enabled = false;
        muteAudioButton.textContent = 'Unmute Audio';
    } else {
        audioTrack.enabled = true;
        muteAudioButton.textContent = 'Mute Audio';
    }
});

// Mute/unmute video
muteVideoButton.addEventListener('click', () => {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack.enabled) {
        videoTrack.enabled = false;
        muteVideoButton.textContent = 'Unmute Video';
    } else {
        videoTrack.enabled = true;
        muteVideoButton.textContent = 'Mute Video';
    }
});

// Adjust volume
volumeControl.addEventListener('input', () => {
    remoteVideo.volume = volumeControl.value;
});

// Initialize signaling and generate user ID
userId = generateUserId();
userIdInput.value = userId;
initSignaling();
