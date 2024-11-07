import axios from 'axios';
import StreamingAvatar, { AvatarQuality, StreamingEvents, } from "@heygen/streaming-avatar";
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

var silenceTimeout = '3000';
const cogSvcRegion = import.meta.env.VITE_SPEECH_SERVICE_REGION;
const cogSvcSubKey = import.meta.env.VITE_SPEECH_SERVICE_KEY;
let tempSpeech = '';
let recognizer: SpeechSDK.SpeechRecognizer;

// DOM elements
const videoElement = document.getElementById("avatarVideo") as HTMLVideoElement;
const startButton = document.getElementById("startSession") as HTMLButtonElement;
const endButton = document.getElementById("endSession") as HTMLButtonElement;
const speakButton = document.getElementById("speakButton") as HTMLButtonElement;
const userInput = document.getElementById("userInput") as HTMLInputElement;

const startVoice = document.getElementById("start-voice") as HTMLInputElement;
const stopVoice = document.getElementById("stop-voice") as HTMLInputElement;
const interrupt = document.getElementById("interrupt") as HTMLInputElement;


export async function getTokenOrRefresh() {
  const headers = { 
    headers: {
      'Ocp-Apim-Subscription-Key': cogSvcSubKey,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  };
  
  try {
    const tokenResponse = await axios.post(`https://${cogSvcRegion}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, null, headers);
    return { authToken: tokenResponse.data, region: cogSvcRegion };
  } catch (err) {
    throw new Error('There was an error authorizing your speech key.');
  }
}

async function sttFromMic() {
  const tokenObj = await getTokenOrRefresh();
  const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(tokenObj.authToken, tokenObj.region);
  speechConfig.setProperty(SpeechSDK.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, silenceTimeout);
  speechConfig.setProperty(SpeechSDK.PropertyId.SpeechServiceConnection_AutoDetectSourceLanguages, "en-US,ar-MA,ar-AE");
  // speechConfig.speechRecognitionLanguage = 'ar-AE';
  console.log(speechConfig);
  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
  recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
  console.log('speak into your microphone...');

  recognizer.startContinuousRecognitionAsync(
    () => {
      console.log('Recognition started successfully.');
    },
    (err: string) => {
      console.log(`ERROR: ${err}`);
    }
  );

  recognizer.recognized = (_, e) => {
    if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
      // console.log(`RECOGNIZED: Text=${e.result.text}`);
      tempSpeech += e.result.text;
    } else {
      console.log(tempSpeech);
      showCaptions('Customer', tempSpeech);
      tempSpeech = '';
      // console.log('ERROR: Speech was cancelled or could not be recognized. Ensure your microphone is working properly.');
    }
  };

  recognizer.sessionStopped = () => {
    console.log('Session stopped event.');
    console.log(tempSpeech);
    showCaptions('Customer', tempSpeech);
    tempSpeech = '';
    recognizer.stopContinuousRecognitionAsync();
  };

  recognizer.canceled = (_, e) => {
    console.log(`CANCELED: Reason=${e.reason}`);
    if (e.reason === SpeechSDK.CancellationReason.EndOfStream) {
      console.log('End of stream reached.');
      console.log(tempSpeech);
      recognizer.stopContinuousRecognitionAsync();
    }
  };
}

function stopMicrophone() {
  if (recognizer) {
    recognizer.stopContinuousRecognitionAsync();
    // console.log(tempSpeech);
      } else {
      console.log('Recognizer is not initialized.');
      }
}



let avatar: StreamingAvatar | null = null;
let sessionData: any = null;

// Helper function to fetch access token
async function fetchAccessToken(): Promise<string> {
  const apiKey = import.meta.env.VITE_HEYGEN_API_KEY;
  const response = await fetch(
    "https://api.heygen.com/v1/streaming.create_token",
    {
      method: "POST",
      headers: { "x-api-key": apiKey },
    }

  );

  const { data } = await response.json();
  return data.token;
}

// Initialize streaming avatar session
async function initializeAvatarSession() {
  debugger;
  const token = await fetchAccessToken();
  console.log(token);
  avatar = new StreamingAvatar({ token });

  // await avatar.startVoiceChat({ useSilencePrompt: false });

  sessionData = await avatar.createStartAvatar({
    quality: AvatarQuality.High,
    avatarName: import.meta.env.VITE_HEYGEN_AVATAR_ID,
  });

  console.log("Session data:", sessionData);

  // Enable end button and disable start button
  endButton.disabled = false;
  startButton.disabled = true;

  avatar.on(StreamingEvents.STREAM_READY, handleStreamReady);
  avatar.on(StreamingEvents.STREAM_DISCONNECTED, handleStreamDisconnected);
}

// Handle when avatar stream is ready
function handleStreamReady(event: any) {
  if (event.detail && videoElement) {
    videoElement.srcObject = event.detail;
    videoElement.onloadedmetadata = () => {
      videoElement.play().catch(console.error);
    };
  } else {
    console.error("Stream is not available");
  }
}

// Handle stream disconnection
function handleStreamDisconnected() {
  console.log("Stream disconnected");
  if (videoElement) {
    videoElement.srcObject = null;
  }

  // Enable start button and disable end button
  startButton.disabled = false;
  endButton.disabled = true;
}

// End the avatar session
async function terminateAvatarSession() {
  if (!avatar || !sessionData) return;

  await avatar.stopAvatar();
  videoElement.srcObject = null;
  avatar = null;
}

// Handle speaking event
async function handleSpeak() {
  if (avatar && userInput.value) {
    await avatar.speak({
      text: userInput.value,
    });
    userInput.value = ""; // Clear input after speaking
  }
}

async function showCaptions(user: string, caption: string) {
  const captionElement = document.getElementById('captionText') as HTMLParagraphElement;
  if (captionElement) {
  switch (user) {
    case 'Customer':
        captionElement.textContent = `You: ${caption}`;
      break;
    case 'Avatar':
        captionElement.textContent = `Nora: ${caption}`;
      break;
      default:
        break;
      }
    }
}

// Event listeners for buttons
startButton.addEventListener("click", initializeAvatarSession);
endButton.addEventListener("click", terminateAvatarSession);
speakButton.addEventListener("click", handleSpeak);

// startVoice.addEventListener("click", startVoiceChat);
startVoice.addEventListener('click', stopMicrophone);
stopVoice.addEventListener("click", sttFromMic);
interrupt.addEventListener("click", () => showCaptions('Avatar', 'Sample Text'));

// DOMContentLoaded 
document.addEventListener('DOMContentLoaded', async function () {

});