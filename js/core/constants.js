/* Fixed lists and defaults used across the app. */

const DEFAULT_SETTINGS = {business:'My Business', currency:'₱', locale:'en-PH', lowStock:5, float:500};

/* Payment method types. The type decides what the Sell screen asks for. */
const KINDS = {
  cash:   {label:'Cash', help:'Counts toward the cash drawer and works out change', pill:'p-cash'},
  digital:{label:'Digital or card', help:'E-wallet, bank transfer or card, with an optional reference number', pill:'p-gcash'},
  credit: {label:'Pay later', help:'Needs the customer’s name and stays unpaid until marked paid', pill:'p-utang'},
};

const ROLES = {owner:'Owner', staff:'Staff'};
const STATUS = {active:['Active','p-cash'], pending:['Pending approval','p-utang'], disabled:['Deactivated','p-void']};

const LOCALES = [['en-PH','Philippines'],['en-US','United States'],['en-GB','United Kingdom'],['en-AU','Australia'],['en-CA','Canada'],['en-IN','India'],['en-SG','Singapore'],['id-ID','Indonesia'],['ms-MY','Malaysia'],['th-TH','Thailand'],['vi-VN','Vietnam'],['ja-JP','Japan'],['de-DE','Germany'],['fr-FR','France'],['es-ES','Spain']];
const UNITS = ['pc','pair','set','box','pack','bottle','can','sack','dozen','kg','g','lb','l','ml','m','hour','service'];
const MEASURES = ['kg','g','lb','oz','l','ml','m','cm'];   // units that never get a plural "s"
const STEPS = [[1,'Whole numbers only (1, 2, 3…)'],[.5,'Halves (0.5, 1, 1.5…)'],[.25,'Quarters (0.25, 0.5…)'],[.1,'Tenths (0.1, 0.2…)'],[.01,'Any amount (0.01)']];
const PALETTE = ['var(--leaf)','var(--blue)','var(--gold)','var(--red)','var(--muted)','var(--ink)'];

const PENCIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const GOOGLE_G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
