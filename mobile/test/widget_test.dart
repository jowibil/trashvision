// Smoke test: the app boots logged-out into the LoginScreen.
//
// The old file was Flutter's counter-app template — it never matched this
// app and stopped compiling when MyApp gained its required `isLoggedIn`
// parameter.

import 'package:TrashVision/main.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('app starts on the login screen when logged out', (tester) async {
    await tester.pumpWidget(const MyApp(isLoggedIn: false));

    // LoginScreen's title marks the successful build + route.
    expect(find.text('TrashVision'), findsOneWidget);
  });
}
