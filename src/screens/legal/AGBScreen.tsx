import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Header } from '../../components/common';
import { colors, spacing, typography } from '../../utils/theme';

type Props = { navigation: NativeStackNavigationProp<any> };

export const AGBScreen: React.FC<Props> = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <Header title="AGB" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>Allgemeine Geschäftsbedingungen</Text>
        <Text style={styles.updated}>Stand: Februar 2026</Text>

        <Text style={styles.h2}>1. Geltungsbereich</Text>
        <Text style={styles.body}>
          Diese AGB gelten für die Nutzung der Web-Applikation "WayFable" (nachfolgend "Dienst"), betrieben von Gabriel Sommer, Schweiz.
        </Text>

        <Text style={styles.h2}>2. Leistungsbeschreibung</Text>
        <Text style={styles.body}>
          WayFable ist eine Reiseplanungs-Applikation. Es gibt zwei Nutzungsstufen:{'\n\n'}
          <Text style={styles.bold}>Free:</Text>{'\n'}
          - 2 aktive Trips{'\n'}
          - 1 vergangener Trip{'\n'}
          - 2 Kollaborateure pro Trip{'\n'}
          - Kein Fotospeicher, keine Routen/Stops{'\n'}
          - Reisebegleiter Fable nur mit separat gekauften Inspirationen{'\n\n'}
          <Text style={styles.bold}>Premium:</Text>{'\n'}
          - Unbegrenzte Trips & Kollaborateure{'\n'}
          - Foto-Galerie{'\n'}
          - Routen & Stops{'\n'}
          - Reisebegleiter Fable mit monatlichen Inspirationen
        </Text>

        <Text style={styles.h2}>3. Preise und Zahlung</Text>
        <Text style={styles.body}>
          - Premium monatlich: CHF 9.90/Monat{'\n'}
          - Premium jährlich: CHF 99/Jahr{'\n'}
          - Zusätzliche Inspirationen: CHF 5 pro 10 Inspirationen{'\n\n'}
          Alle Preise verstehen sich inklusive allfälliger Steuern. Die Zahlung erfolgt über Stripe. Es gelten die Zahlungsbedingungen von Stripe.
        </Text>

        <Text style={styles.h2}>4. Kündigung</Text>
        <Text style={styles.body}>
          Das Premium-Abonnement kann jederzeit gekündigt werden. Die Kündigung wird zum Ende der aktuellen Abrechnungsperiode wirksam. Nach der Kündigung wird der Account auf den Free-Tarif zurückgestuft.
        </Text>

        <Text style={styles.h2}>5. Verfügbarkeit</Text>
        <Text style={styles.body}>
          Wir bemühen uns um eine hohe Verfügbarkeit des Dienstes, garantieren jedoch keine ununterbrochene Erreichbarkeit. Wartungsarbeiten und technische Störungen sind möglich.
        </Text>

        <Text style={styles.h2}>6. Haftung</Text>
        <Text style={styles.body}>
          Die Nutzung des Dienstes erfolgt auf eigene Verantwortung. WayFable haftet nicht für:{'\n\n'}
          - Schäden durch fehlerhafte Empfehlungen des Reisebegleiters{'\n'}
          - Datenverlust bei technischen Störungen{'\n'}
          - Aktualität und Richtigkeit von Reiseinformationen{'\n\n'}
          Die Haftung wird im gesetzlich zulässigen Rahmen ausgeschlossen.
        </Text>

        <Text style={styles.h2}>7. Nutzerpflichten</Text>
        <Text style={styles.body}>
          Nutzer verpflichten sich:{'\n\n'}
          - Keine illegalen Inhalte hochzuladen{'\n'}
          - Ihre Zugangsdaten geheim zu halten{'\n'}
          - Den Dienst nicht missbräuchlich zu nutzen
        </Text>

        <Text style={styles.h2}>8. Geistiges Eigentum</Text>
        <Text style={styles.body}>
          Die von Nutzern erstellten Inhalte (Reisepläne, Fotos, Texte) verbleiben im Eigentum der Nutzer. WayFable erhält ein nicht-exklusives Nutzungsrecht zur Bereitstellung des Dienstes.
        </Text>

        <Text style={styles.h2}>9. Änderungen der AGB</Text>
        <Text style={styles.body}>
          Wir behalten uns vor, diese AGB zu ändern. Wesentliche Änderungen werden per E-Mail mitgeteilt. Die weitere Nutzung des Dienstes nach Änderung gilt als Zustimmung.
        </Text>

        <Text style={styles.h2}>10. Anwendbares Recht</Text>
        <Text style={styles.body}>
          Es gilt Schweizer Recht. Gerichtsstand ist der Wohnsitz des Betreibers in der Schweiz.
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
