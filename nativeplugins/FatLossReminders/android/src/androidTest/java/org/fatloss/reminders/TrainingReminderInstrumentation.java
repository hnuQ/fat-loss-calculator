package org.fatloss.reminders;

import android.app.Activity;
import android.app.Instrumentation;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import java.util.Calendar;

/** Runs the production scheduler/receiver against the device OS, in an isolated test package. */
public final class TrainingReminderInstrumentation extends Instrumentation {
    private String scenario;
    private int leadMinutes;
    @Override public void onCreate(Bundle arguments) { scenario = arguments.getString("scenario", "arrange"); leadMinutes = Integer.parseInt(arguments.getString("leadMinutes", "2")); start(); }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            Context context = getTargetContext();
            NotificationManager notifications = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            switch (scenario) {
                case "natural": {
                    Calendar due = Calendar.getInstance(); due.add(Calendar.MINUTE, leadMinutes);
                    int weekday = due.get(Calendar.DAY_OF_WEEK) == Calendar.SUNDAY ? 7 : due.get(Calendar.DAY_OF_WEEK) - 1;
                    TrainingScheduler.replace(context, true, 1 << (weekday - 1), due.get(Calendar.HOUR_OF_DAY), due.get(Calendar.MINUTE));
                    due.set(Calendar.SECOND, 0); due.set(Calendar.MILLISECOND, 0);
                    result.putLong("expectedAt", due.getTimeInMillis());
                    break;
                }
                case "status":
                    result.putBoolean("exact", TrainingScheduler.exactPermitted(context));
                    result.putBoolean("notifications", TrainingScheduler.permitted(context));
                    result.putBoolean("sound", TrainingScheduler.soundPermitted(context));
                    break;
                case "arrange":
                    TrainingScheduler.replace(context, true, 5, 18, 30);
                    break;
                case "modify":
                    TrainingScheduler.replace(context, true, 16, 19, 0);
                    break;
                case "restore":
                    TrainingScheduler.restore(context);
                    break;
                case "deliver": {
                    int generation = context.getSharedPreferences("fat-loss-training-reminders-v1", Context.MODE_PRIVATE).getInt("generation", 0);
                    context.sendBroadcast(new Intent(context, TrainingAlarmReceiver.class).setAction(TrainingScheduler.ACTION).putExtra("weekday", 5).putExtra("generation", generation).putExtra("occurrence", System.currentTimeMillis()));
                    boolean delivered = false;
                    for (int attempt = 0; attempt < 30; attempt++) {
                        if (notifications.getActiveNotifications().length == 1) { delivered = true; break; }
                        Thread.sleep(100);
                    }
                    if (!delivered) throw new AssertionError("Production receiver did not post the local training notification");
                    break;
                }
                case "stale": {
                    notifications.cancelAll();
                    int generation = context.getSharedPreferences("fat-loss-training-reminders-v1", Context.MODE_PRIVATE).getInt("generation", 0);
                    context.sendBroadcast(new Intent(context, TrainingAlarmReceiver.class).setAction(TrainingScheduler.ACTION).putExtra("weekday", 5).putExtra("generation", generation - 1));
                    Thread.sleep(500);
                    if (notifications.getActiveNotifications().length != 0) throw new AssertionError("Replaced alarm posted a stale notification");
                    break;
                }
                case "close":
                    TrainingScheduler.replace(context, false, 0, 0, 0);
                    if (notifications.getActiveNotifications().length != 0) throw new AssertionError("Closing reminder left a notification");
                    break;
                case "denied": {
                    if (TrainingScheduler.permitted(context)) throw new AssertionError("System notification denial was not detected");
                    boolean rejected = false;
                    try { TrainingScheduler.replace(context, true, 5, 18, 30); }
                    catch (IllegalStateException expected) { rejected = true; }
                    if (!rejected) throw new AssertionError("Scheduling succeeded after system notification denial");
                    break;
                }
                case "calendar": {
                    Calendar now = Calendar.getInstance();
                    for (int day = 1; day <= 7; day++) {
                        long next = TrainingScheduler.nextOccurrence(day, 18, 30, now.getTimeInMillis());
                        Calendar occurrence = Calendar.getInstance(); occurrence.setTimeInMillis(next);
                        if (next <= now.getTimeInMillis() || occurrence.get(Calendar.DAY_OF_WEEK) != (day == 7 ? Calendar.SUNDAY : day + 1) || occurrence.get(Calendar.HOUR_OF_DAY) != 18 || occurrence.get(Calendar.MINUTE) != 30) throw new AssertionError("Weekly local calendar occurrence is invalid");
                    }
                    break;
                }
                default: throw new IllegalArgumentException("Unknown native acceptance scenario");
            }
            result.putString("stream", "NATIVE_TRAINING_PASS " + scenario + "\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("stream", "NATIVE_TRAINING_FAIL " + scenario + ": " + error.getMessage() + "\n");
            finish(Activity.RESULT_CANCELED, result);
        }
    }
}
