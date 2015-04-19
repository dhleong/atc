/* global prop, ui_log:true, input_select:true */
/* jshint indent: 2 */

function voice_init() {
  prop.voice = {};
  prop.voice.recognitionClass = window.webkitSpeechRecognition;
  prop.voice.enabled = true; // FIXME
  prop.voice.running = false;

  prop.voice.callsigns = {};

  if('atc-voice-enabled' in localStorage && localStorage['atc-voice-enabled'] == 'true') {
    prop.voice.enabled = true;
    // $(".voice-toggle").addClass("active"); // FIXME
  }
}

function voice_ready() {
  // index airlines by callsign
  for (var icao in prop.airline.airlines) {
    var airline = prop.airline.airlines[icao];
    var callsign = airline.callsign.name;
    prop.voice.callsigns[callsign.toLowerCase()] = icao;
  }

  if (prop.voice.enabled) {
    voice_start();
  }
}

function voice_start() {
  if (!prop.voice.recognitionClass) {
    return;
  } else if (!prop.voice.recognition) {
    prop.voice.recognition = new prop.voice.recognitionClass();
    prop.voice.recognition.continuous = true;
    // prop.voice.recognition.interimResults = true;
    prop.voice.recognition.lang = "en";
    prop.voice.recognition.onresult = voice_onresult;
    prop.voice.recognition.onend = voice_onend;
  }

  prop.voice.recognition.start();
  prop.voice.running = true;
}

function voice_stop() {
  if (!prop.voice.running) {
    return;
  }

  prop.voice.running = false;
  prop.voice.recognition.stop();
}

function voice_onresult(event) {
  var bestResult;
  try {
    bestResult = event.results[0][0];
  } catch (e) {
  } finally {
    // restart listening
    // (the onend listener will handle startup)
    prop.voice.recognition.stop();
  }

  voice_process(bestResult.transcript);
}

function voice_onend() {
  if (prop.voice.running) {
    // we requested a restart
    voice_start();
  }
}

function voice_process(raw) {
  try {
    voice_process_unsafe(raw);
  } catch (e) {
    console.warn(e);
  }
}

function voice_process_unsafe(raw) {
  var parts = raw.split(/ /);
  var callsign = voice_process_callsign(raw, parts);
  if (!callsign) return;

  console.log(">>>", raw);
  console.log("> plane:", callsign);
  input_select(callsign.toUpperCase());
}

function voice_process_callsign(raw, parts) {
  var airplaneMatch = raw.match(/(.*?)[ ]([0-9]+)/);
  if (!airplaneMatch) {
    console.warn("No match:", raw);
    return;
  }

  var airline = airplaneMatch[1].toLowerCase();
  var icao = prop.voice.callsigns[airline];
  var extra = '';
  if (!icao) {
    ui_log(true, "Unknown callsign " + airline);
    return;
  } else if (icao == 'cessna') {
    icao = 'N';

    // cessna callsigns include two letters after
    var letter1 = parts[2];
    var letter2 = parts[3];
    extra = letter1[0] + letter2[0];
  }

  return icao + airplaneMatch[2] + extra;
}
