
function speech_init() {
  prop.speech = {};
  prop.speech.synthesis = window.speechSynthesis;
  prop.speech.enabled = false;
  prop.speech.voices = [null];

  if('atc-speech-enabled' in localStorage && localStorage['atc-speech-enabled'] == 'true') {
    prop.speech.enabled = true;
    $(".speech-toggle").addClass("active");
  }
}

function speech_ready() {

  var voiceWhitelist = [
    // This is a whitelist of `en-*` voices that 
    //  "sounded the most realistic" from Chrome.
    // TODO Actually, a lot of the non-EN voices
    //  work just fine rendering english, so long
    //  as numbers are spelled out. Perhaps a blacklist
    //  is a better approach (Chrome provides some robot
    //  voices and singing voices that would break immersion)
    "Google US English",
    "Google UK English Male",
    "Google UK English Female",
    "Alex",
    "Agnes",
    "Bruce",
    "Daniel",
    "Fiona",
    "Karen",
    "Moira",
    "Samantha",
    "Tessa",
    "Veena",
    "Vicki",
    "Victoria",
  ].reduce(function(map, name) {
    map[name] = true;
    return map;
  }, {});

  // NB: we MUST wait until "ready"; otherwise,
  //  getVoices() is empty
  if (prop.speech.synthesis != null) {
    var voices = prop.speech.synthesis.getVoices()
    .filter(function(voice) {
      return voiceWhitelist[voice.name];
    });
    if (voices.length) {
      prop.speech.voices = voices;
    }
  }

}

function speech_say(textToSay, opts) {
  var opts = opts || {};
  if(prop.speech.synthesis != null && prop.speech.enabled) {
    // Split numbers into individual digits e.g. Speedbird 666 -> Speedbird 6 6 6
    textToSay = textToSay.replace(/[0-9]/g, "$& ").replace(/\s0/g, " zero");
    var utterance = new SpeechSynthesisUtterance(textToSay);
    utterance.voice = opts.voice;
    prop.speech.synthesis.speak(utterance);
  }
}

function speech_toggle() {
  prop.speech.enabled = !prop.speech.enabled;

  if(prop.speech.enabled) {
    $(".speech-toggle").addClass("active");
  } else {
    $(".speech-toggle").removeClass("active");
    prop.speech.synthesis.cancel();
  }

  localStorage['atc-speech-enabled'] = prop.speech.enabled;

}

function speech_pick_voice() {
  return choose(prop.speech.voices);
}
