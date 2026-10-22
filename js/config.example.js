/* Firebase connection. Copy this file to js/config.js, then paste your web app's config:
   Firebase console -> Project settings -> General -> Your apps -> Web app -> "firebaseConfig".
   These values identify your project and are safe to load in the browser; firebase/firestore.rules protects the data.
   js/config.js is git-ignored so your project details stay out of GitHub. */
window.BENTALOG_CONFIG = {
  firebase: {
    apiKey: '',
    authDomain: '',          // e.g. 'your-project.firebaseapp.com'
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  },

  // How many days of sales to load when the app opens. Older days load when you pick them in History.
  salesDays: 180,
};
