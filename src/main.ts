import axios from 'axios';
import StreamingAvatar, { AvatarQuality, StreamingEvents, VoiceEmotion } from "@heygen/streaming-avatar";
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

var silenceTimeout = '3000';
const cogSvcRegion = import.meta.env.VITE_SPEECH_SERVICE_REGION;
const cogSvcSubKey = import.meta.env.VITE_SPEECH_SERVICE_KEY;
let tempSpeech = '';
let recognizer: SpeechSDK.SpeechRecognizer;
// var userDetails = '';
let chatHistory: Array<{ role: string, content: string }> = [];
const test = import.meta.env.VITE_HEYGEN_API_KEY;
console.log(test);
// DOM elements
const videoElement = document.getElementById("avatarVideo") as HTMLVideoElement;
const startButton = document.getElementById("startSession") as HTMLButtonElement;
const endButton = document.getElementById("endSession") as HTMLButtonElement;
// const speakButton = document.getElementById("speakButton") as HTMLButtonElement;
// const userInput = document.getElementById("userInput") as HTMLInputElement;

const startVoice = document.getElementById("start-voice") as HTMLInputElement;
const stopVoice = document.getElementById("stop-voice") as HTMLInputElement;
const interrupt = document.getElementById("interrupt") as HTMLInputElement;

// Azure Blob Service 
const AZURE_STORAGE_CONNECTION_STRING = import.meta.env.VITE_AZURE_STORAGE_CONNECTION_STRING;

if (!AZURE_STORAGE_CONNECTION_STRING) {
  throw Error('Azure Storage Connection string not found');
}

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

async function talktoOpenAI(query: string) {
  // Prepare the chat history to be included in the messages
  const chatHistoryMessages = chatHistory.map(chat => ({
    role: chat.role,
    content: chat.content
  }));

  // Add the current user query to the chat history
  chatHistoryMessages.push({
    role: "user",
    content: query
  });

  const settings = {
    url: "https://openai-futurestore.openai.azure.com/openai/deployments/gpt-4/chat/completions?api-version=2024-02-15-preview",
    method: "POST",
    headers: {
      "api-key": import.meta.env.VITE_OPENAI_KEY,
      "Content-Type": "application/json"
    },
    data: JSON.stringify({
      messages: [
        {
          role: "system",
          content: [
            {
              type: "text",
              text: `You are an Omantel virtual customer service executive. Begin by warmly greeting the customer and establishing a friendly rapport. Engage in a professional conversation to understand the customer's requirements thoroughly. Assist the customer in finding the best product from the Omantel store, ensuring a helpful and friendly interaction throughout. Your response must be in JSON format with only the 'speech' key, which contains the text you would say to the user.`
            }
          ]
        },
        ...chatHistoryMessages
      ],
      temperature: 0.7,
      top_p: 0.95,
      max_tokens: 800
    })
  };

  try {
    const response = await axios(settings);
    console.log(response.data.choices[0].message.content);
    try {
      const jsonResponse = JSON.parse(response.data.choices[0].message.content);
      const speech = jsonResponse.speech;
      chatHistory.push({
        role: "assistant",
        content: speech
      });
      if (sessionData) {
        handleSpeak(speech);
      }
      showCaptions('Avatar', speech);
    } catch (error) {
      console.error("Failed to parse JSON response for chat history:", error);
    }
    // await handleOpenAIResponse(response.data.choices[0].message.content);
  } catch (error) {
    console.error('Error communicating with OpenAI:', error);
  }
}

// async function handleOpenAIResponse(response: string) {
// try {
//   const jsonResponse = JSON.parse(response);
//   let userDetails = jsonResponse.user;
//   console.log(userDetails);
//   console.log("Parsed JSON response:", jsonResponse);
//   showCaptions('Avatar', jsonResponse.speech);

//   if (jsonResponse.function) {
//     await handlefunction(jsonResponse.function, jsonResponse.parameters)
//   }
// } catch (error) {
//   console.error("Failed to parse JSON response:", error);
// }
// }

// async function getNewSIM() {
//   if (userDetails) {
    
//   }else{

//   }
// }

// // async function getUserDetails() {
  
// // }

// async function handlefunction(functionName: string, parameters: any) {
//   switch (functionName) {
//     case 'new_sim':
//       console.log("Executing new SIM function");
//       await getNewSIM();
//       break;
//     case 'upgrade_sim':
//       console.log("Executing upgrade SIM function with parameters:", parameters);
//       break;
//     case 'inquire_product':
//       console.log("Executing inquire product function with parameters:", parameters);
//       break;
//     case 'ask_for_clarification':
//       console.log("Executing ask for clarification function");
//       break;
//     default:
//       console.error("Unknown function:", functionName);
//   }
// }

async function sttFromMic() {
  const tokenObj = await getTokenOrRefresh();
  const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(tokenObj.authToken, tokenObj.region);
  speechConfig.setProperty(SpeechSDK.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, silenceTimeout);
  speechConfig.setProperty(SpeechSDK.PropertyId.SpeechServiceConnection_AutoDetectSourceLanguages, "ar-MA,ar-AE");
  console.log(speechConfig);
  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
  recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
  console.log('speak into your microphone...');
  startVoice.classList.remove('d-none');
  stopVoice.classList.add('d-none');
  recognizer.startContinuousRecognitionAsync(
    () => {
      console.log('Recognition started successfully.');
    },
    (err: string) => {
      console.log(`ERROR: ${err}`);
    }
  );

  recognizer.recognizing = (_, e) => {
    // console.log(`RECOGNIZING: Text=${e.result.text}`);
    showCaptions('Customer', e.result.text);
  };

  recognizer.recognized = (_, e) => {
    if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
      console.log(`RECOGNIZED: Text=${e.result.text}`);
      tempSpeech += e.result.text;
      talktoOpenAI(tempSpeech);
      tempSpeech = '';
    } else if (e.result.reason === SpeechSDK.ResultReason.NoMatch) {
      console.log("NOMATCH: Speech could not be recognized.");
    }
  };

  recognizer.canceled = (_, e) => {
    console.log(`CANCELED: Reason=${e.reason}`);
    if (e.reason === SpeechSDK.CancellationReason.Error) {
      console.log(`"CANCELED: ErrorCode=${e.errorCode}`);
      console.log(`"CANCELED: ErrorDetails=${e.errorDetails}`);
      console.log("CANCELED: Did you set the speech resource key and region values?");
    }
    recognizer.stopContinuousRecognitionAsync();
    startVoice.classList.add('d-none');
    stopVoice.classList.remove('d-none');
  };

  recognizer.sessionStopped = (_) => {
    console.log("\n    Session stopped event.");
    console.log(tempSpeech);
    showCaptions('Customer', tempSpeech);
    if (tempSpeech) {
      talktoOpenAI(tempSpeech);
    }
    tempSpeech = '';
    recognizer.stopContinuousRecognitionAsync();
    startVoice.classList.add('d-none');
    stopVoice.classList.remove('d-none');
  };
}

function stopMicrophone() {
  if (recognizer) {
    startVoice.classList.add('d-none');
    stopVoice.classList.remove('d-none');
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
    // voice:{
    //   voiceId:"084760b4922a44599575c770070ec2d7"
    // },
    language: "Arabic"
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
async function handleSpeak(text : string) {
  if (avatar && text) {
    await avatar.speak({
      text: text,
    });
    // userInput.value = ""; // Clear input after speaking
  }
}

async function showCaptions(user: string, caption: string) {
  const captionElement = document.getElementById('captionText') as HTMLParagraphElement;
  if (captionElement && caption) {
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
// speakButton.addEventListener("click", handleSpeak);

// startVoice.addEventListener("click", startVoiceChat);
startVoice.addEventListener('click', stopMicrophone);
stopVoice.addEventListener("click", sttFromMic);
interrupt.addEventListener("click", () => handleSpeak('مرحبا بكم في خدمة المشتركين من عمانتل! أنا بخير ، شكرا على سؤالك. كيف يمكنني مساعدتك اليوم؟'));

// DOMContentLoaded 
document.addEventListener('DOMContentLoaded', async function () {

});