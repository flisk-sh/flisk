# TDK CLI — ξεκινήστε τις υπηρεσίες στον υπολογιστή σας

[English](../README.md) · Ελληνικά · [Άλλες γλώσσες](../README.md#readme-languages)

### Σταματήστε να αφήνετε την AI να επινοεί την τοπική σας υποδομή.

Τα LLM γράφουν εξαιρετικά τη λογική εφαρμογών, αλλά συντηρούν άσχημα την τοπική υποδομή. Κάθε φορά που η AI ξαναγράφει ένα `Dockerfile`, ρυθμίζει λάθος ένα `Tiltfile` ή χαλάει ένα `nginx.conf`, χάνετε χρόνο και ξοδεύετε άσκοπα API tokens.

**Το TDK CLI Core** γεφυρώνει αυτό το κενό. Γράφετε τη λογική της web εφαρμογής σας, και το TDK ανιχνεύει αυτόματα το stack σας για να δημιουργήσει, να συνδέσει και να ενορχηστρώσει το τοπικό περιβάλλον.

Εγκατάσταση:

```bash
npm install -g @tdk-landscape/tdk-cli-core
```

Γρήγορη εκκίνηση:

```bash
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

Για απαιτήσεις, άδεια και αντιμετώπιση προβλημάτων, δείτε το [αγγλικό README](../README.md). Η τεκμηρίωση βρίσκεται στον [ιστότοπο του TDK](https://tdk-landscape.github.io/tdk-website/).
