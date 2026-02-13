import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Header } from '../../components/common';
import { colors, spacing, typography } from '../../utils/theme';

type Props = { navigation: NativeStackNavigationProp<any> };

export const DatenschutzScreen: React.FC<Props> = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <Header title="Datenschutz" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>Datenschutzerklärung</Text>
        <Text style={styles.updated}>Stand: Februar 2026</Text>

        <Text style={styles.h2}>1. Verantwortliche Person</Text>
        <Text style={styles.body}>
          Gabriel Sommer{'\n'}
          Grabenstrasse 15{'\n'}
          5032 Aarau-Rohr, Schweiz{'\n'}
          E-Mail: programmable.work@gmail.com
        </Text>

        <Text style={styles.h2}>2. Erhobene Daten</Text>
        <Text style={styles.body}>
          Wir erheben folgende personenbezogene Daten:{'\n\n'}
          - E-Mail-Adresse und Name (bei Registrierung){'\n'}
          - Profilbild (optional){'\n'}
          - Reisedaten: Ziele, Daten, Aktivitäten, Unterkünfte{'\n'}
          - Standortdaten (Stops, Aktivitäts-Orte){'\n'}
          - Ausgaben und Budgetdaten{'\n'}
          - Fotos (nur Premium-Nutzer){'\n'}
          - Zahlungsdaten (über Stripe verarbeitet)
        </Text>

        <Text style={styles.h2}>3. Zweck der Datenverarbeitung</Text>
        <Text style={styles.body}>
          - Bereitstellung der Reiseplanungs-Funktionen{'\n'}
          - Zusammenarbeit mit anderen Nutzern{'\n'}
          - Reisebegleiter Fable (Planung mittels Inspirationen){'\n'}
          - Abrechnung und Zahlungsabwicklung{'\n'}
          - Verbesserung unseres Dienstes
        </Text>

        <Text style={styles.h2}>4. Drittanbieter</Text>
        <Text style={styles.body}>
          Wir nutzen folgende Drittanbieter:{'\n\n'}
          <Text style={styles.bold}>Supabase</Text> (Cloud-Datenbank, Authentifizierung, Dateispeicher) — Daten werden auf EU-Servern gespeichert.{'\n\n'}
          <Text style={styles.bold}>Stripe</Text> (Zahlungsabwicklung) — Verarbeitet Zahlungsdaten gemäss PCI DSS.{'\n\n'}
          <Text style={styles.bold}>Google Maps</Text> (Kartenanzeige, Routenberechnung) — IP-Adresse und Standortdaten werden an Google übermittelt. Es gelten die Datenschutzbestimmungen von Google (policies.google.com/privacy).{'\n\n'}
          <Text style={styles.bold}>Unsplash</Text> (Coverbilder) — Keine personenbezogenen Daten werden übermittelt.{'\n\n'}
          <Text style={styles.bold}>Anthropic</Text> (Reisebegleiter Fable) — Reisedaten (Ziel, Daten, Vorlieben, Gesprächsinhalte) werden zur Plangeneration an Anthropic (USA) übermittelt. Anthropic speichert diese Daten nicht dauerhaft und verwendet sie nicht zum Training von KI-Modellen gemäss deren Nutzungsbedingungen.
        </Text>

        <Text style={styles.h2}>5. Deine Rechte</Text>
        <Text style={styles.body}>
          Du hast gemäss dem Schweizer Datenschutzgesetz (nDSG) folgende Rechte:{'\n\n'}
          - <Text style={styles.bold}>Auskunft:</Text> Du kannst jederzeit Auskunft über deine gespeicherten Daten verlangen.{'\n'}
          - <Text style={styles.bold}>Berichtigung:</Text> Du kannst deine Daten im Profil jederzeit bearbeiten.{'\n'}
          - <Text style={styles.bold}>Löschung:</Text> Du kannst deinen Account und alle Daten über die Profil-Einstellungen löschen.{'\n'}
          - <Text style={styles.bold}>Datenportabilität:</Text> Du kannst einen Export deiner Daten anfordern.{'\n'}
          - <Text style={styles.bold}>Widerspruch:</Text> Du kannst der Verarbeitung widersprechen.{'\n\n'}
          Wir beantworten Anfragen zu deinen Rechten innerhalb von 30 Tagen (Art. 25 nDSG). Kontaktiere uns unter programmable.work@gmail.com.
        </Text>

        <Text style={styles.h2}>6. Aufbewahrung</Text>
        <Text style={styles.body}>
          Deine Daten werden gespeichert, solange dein Account besteht. Bei Löschung des Accounts werden alle Daten unwiderruflich entfernt, einschliesslich Trips, Fotos und Zahlungsinformationen bei Stripe.
        </Text>

        <Text style={styles.h2}>7. Sicherheit</Text>
        <Text style={styles.body}>
          Wir setzen technische und organisatorische Massnahmen ein, um deine Daten zu schützen. Die Übertragung erfolgt verschlüsselt (HTTPS/TLS). Passwörter werden gehasht gespeichert.
        </Text>

        <Text style={styles.h2}>8. Cookies</Text>
        <Text style={styles.body}>
          Wir verwenden keine Marketing-Cookies. Notwendige Session-Cookies dienen der Authentifizierung.
        </Text>

        <Text style={styles.h2}>9. Zuständige Behörde</Text>
        <Text style={styles.body}>
          Eidgenössischer Datenschutz- und Öffentlichkeitsbeauftragter (EDÖB){'\n'}
          Feldeggweg 1{'\n'}
          CH-3003 Bern{'\n'}
          www.edoeb.admin.ch
        </Text>

        <Text style={styles.h2}>10. Kontakt</Text>
        <Text style={styles.body}>
          Bei Fragen zum Datenschutz kontaktiere uns unter:{'\n'}
          programmable.work@gmail.com
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },
  h1: { ...typography.h1, marginBottom: spacing.sm },
  h2: { ...typography.h3, marginTop: spacing.lg, marginBottom: spacing.sm },
  body: { ...typography.body, color: colors.textSecondary, lineHeight: 24 },
  bold: { fontWeight: '600', color: colors.text },
  updated: { ...typography.caption, color: colors.textLight, marginBottom: spacing.lg },
});
