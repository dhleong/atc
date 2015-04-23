
function speech_init() {
  prop.speech = {};
  prop.speech.synthesis = window.speechSynthesis;
  prop.speech.enabled = false;
  prop.speech.queue = [];

  if('atc-speech-enabled' in localStorage && localStorage['atc-speech-enabled'] == 'true') {
    prop.speech.enabled = true;
    $(".speech-toggle").addClass("active");
  }
}

function speech_say(textToSay) {

  if(prop.speech.synthesis != null && prop.speech.enabled) {

    if (prop.voice.recognizing) {
      log("Enqueue: " + textToSay, LOG_DEBUG);
      prop.speech.queue.push(textToSay);
      return;
    }

    // Split numbers into individual digits e.g. Speedbird 666 -> Speedbird 6 6 6
    textToSay = textToSay.replace(/[0-9]/g, "$& ").replace(/\s0/g, " zero");
    prop.speech.synthesis.speak(new SpeechSynthesisUtterance(textToSay));
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

function speech_run_queue() {
  $.each(prop.speech.queue, function(i, speech) {
    speech_say(speech);
  });
  prop.speech.queue = [];
}
