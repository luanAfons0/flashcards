/* The Settings view: the Daily Limit, read with get_settings and saved with
   update_settings, the same for every Deck.

   The fields are filled once each time the view opens, so drawing it again
   when the window gains focus never overwrites what is being typed. A save
   shows Saved; a refused value shows the Plugin Server's sentence under its
   field, and nothing is saved.

   Its top level only declares, so its pure part, limitGiven and isLimit, runs
   in node:vm as served. app.js draws the view with drawSettings, calls
   leaveSettings when another view shows, and sends the form to saveSettings. */
'use strict';

/** Each Daily Limit field, with the setting update_settings takes from it. */
const LIMIT_FIELDS = [
  { field: 'lim-new', key: 'newCardsPerDay' },
  { field: 'lim-rev', key: 'reviewsPerDay' },
];

/** The largest value a setting takes. */
const MOST_PER_DAY = 9999;

/**
 * What a field holds, as update_settings takes it: a whole number as a
 * number, and anything else as the text it is, which the Plugin Server
 * refuses with a sentence.
 */
function limitGiven(text) {
  const given = String(text).trim();
  return /^\d+$/.test(given) ? Number(given) : given;
}

/** Whether update_settings takes this value: a whole number from 0 to 9999. */
function isLimit(value) {
  return Number.isInteger(value) && value >= 0 && value <= MOST_PER_DAY;
}

/** Whether the fields show what the Settings held when the view opened. */
let settingsFilled = false;

/** Put these Settings in the fields, with no Saved and no error line. */
function fillSettings(settings) {
  for (const { field, key } of LIMIT_FIELDS) byId(field).value = String(settings[key]);
  clearSettingsMarks();
  settingsFilled = true;
}

/** Take away Saved and every error line. */
function clearSettingsMarks() {
  byId('saved').hidden = true;
  for (const { field } of LIMIT_FIELDS) {
    byId(field).removeAttribute('aria-invalid');
    byId(field).removeAttribute('aria-describedby');
    byId(field + '-err').hidden = true;
  }
}

/** The Settings view: the fields filled with the Settings, once each time it opens. */
async function drawSettings() {
  if (settingsFilled) return;
  fillSettings(await call('get_settings'));
}

/** Another view shows: the next time Settings opens, it reads them again. */
function leaveSettings() {
  settingsFilled = false;
}

/**
 * Save the form. On a refusal the fields stay as typed, and the sentence
 * shows under the first field that holds no limit; every such field is
 * marked. A refusal of anything else goes to the banner.
 */
async function saveSettings(event) {
  event.preventDefault();
  clearSettingsMarks();
  const given = {};
  for (const { field, key } of LIMIT_FIELDS) given[key] = limitGiven(byId(field).value);
  try {
    fillSettings(await call('update_settings', given));
    byId('saved').hidden = false;
  } catch (fault) {
    const sentence = fault.message || String(fault);
    const wrong = LIMIT_FIELDS.filter(({ key }) => !isLimit(given[key]));
    if (wrong.length === 0) {
      say(sentence);
      return;
    }
    for (const { field } of wrong) byId(field).setAttribute('aria-invalid', 'true');
    const first = wrong[0].field;
    byId(first).setAttribute('aria-describedby', first + '-err');
    byId(first + '-err').querySelector('span').textContent = sentence;
    byId(first + '-err').hidden = false;
    byId(first).focus();
  }
}
