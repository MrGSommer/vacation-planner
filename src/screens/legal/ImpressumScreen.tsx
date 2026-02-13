import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Header } from '../../components/common';
import { colors, spacing, typography } from '../../utils/theme';

type Props = { navigation: NativeStackNavigationProp<any> };

export const ImpressumScreen: React.FC<Props> = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <Header title="Impressum" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>Impressum</Text>

        <Text style={styles.h2}>Angaben gemäss Schweizer Recht</Text>
        <Text style={styles.body}>
          Gabriel Sommer{'\n'}
          Grabenstrasse 15{'\n'}
          5032 Aarau-Rohr{'\n'}
          Schweiz
        </Text>

        <Text style={styles.h2}>Kontakt</Text>
        <Text style={styles.body}>
          E-Mail: programmable.work@gmail.com
        </Text>

        <Text style={styles.h2}>Rechtsform</Text>
        <Text style={styles.body}>
          Privatperson / Einzelunternehmen{'\n'}
          Nicht im Handelsregister eingetragen (unter CHF 100'000 Jahresumsatz).
        </Text>

        <Text style={styles.h2}>Mehrwertsteuer</Text>
        <Text style={styles.body}>
          Nicht MwSt-pflichtig (unter CHF 100'000 Jahresumsatz gemäss Art. 10 MWSTG).
        </Text>

        <Text style={styles.h2}>Haftungsausschluss</Text>
        <Text style={styles.body}>
          Der Autor übernimmt keinerlei Gewähr hinsichtlich der inhaltlichen Richtigkeit, Genauigkeit, Aktualität, Zuverlässigkeit und Vollständigkeit der Informationen.
        </Text>

        <Text style={styles.h2}>Urheberrechte</Text>
        <Text style={styles.body}>
          Die Urheber- und alle anderen Rechte an Inhalten, Bildern, Fotos oder anderen Dateien auf dieser Website gehören ausschliesslich dem Betreiber oder den speziell genannten Rechteinhabern.
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },
  h1: { ...typography.h1, marginBottom: spacing.lg },
  h2: { ...typography.h3, marginTop: spacing.lg, marginBottom: spacing.sm },
  body: { ...typography.body, color: colors.textSecondary, lineHeight: 24 },
});
