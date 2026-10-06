package org.fatloss.reminders;

import android.app.Activity;
import android.app.Instrumentation;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import java.util.Calendar;
import java.util.List;

/** Runs the production scheduler, receiver and ringing service against the device OS, in an isolated test package. */
public final class TrainingReminderInstrumentation extends Instrumentation {
    private interface Check { boolean ok(); }

    private String scenario;
    private int leadMinutes;

    @Override public void onCreate(Bundle arguments) { scenario = arguments.getString("scenario", "arrange"); leadMinutes = Integer.parseInt(arguments.getString("leadMinutes", "2")); start(); }

    private static SharedPreferences prefs(Context context) { return context.getSharedPreferences("fat-loss-training-reminders-v1", Context.MODE_PRIVATE); }
    private static int isoWeekday(Calendar moment) { return moment.get(Calendar.DAY_OF_WEEK) == Calendar.SUNDAY ? 7 : moment.get(Calendar.DAY_OF_WEEK) - 1; }
    private static void waitUntil(String message, Check check) throws Exception {
        for (int attempt = 0; attempt < 150; attempt++) { if (check.ok()) return; Thread.sleep(100); }
        throw new AssertionError(message);
    }

    /** 与自然到时同一条生产链路：只在到点后注入闹钟广播，不代替真机听觉验收。 */
    private static void deliverAlarm(Context context, String mode, String sound) {
        Calendar due = Calendar.getInstance();
        TrainingScheduler.replace(context, true, 1 << (isoWeekday(due) - 1), due.get(Calendar.HOUR_OF_DAY), due.get(Calendar.MINUTE), mode, sound);
        int generation = prefs(context).getInt("generation", 0);
        context.sendBroadcast(new Intent(context, TrainingAlarmReceiver.class).setAction(TrainingScheduler.ACTION)
                .putExtra("weekday", isoWeekday(due)).putExtra("generation", generation).putExtra("occurrence", System.currentTimeMillis()));
    }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            Context context = getTargetContext();
            NotificationManager notifications = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            switch (scenario) {
                case "natural": {
                    Calendar due = Calendar.getInstance(); due.add(Calendar.MINUTE, leadMinutes);
                    due.set(Calendar.SECOND, 0); due.set(Calendar.MILLISECOND, 0);
                    TrainingScheduler.replace(context, true, 1 << (isoWeekday(due) - 1), due.get(Calendar.HOUR_OF_DAY), due.get(Calendar.MINUTE), "notification", "");
                    result.putLong("expectedAt", due.getTimeInMillis());
                    break;
                }
                case "naturalRing": {
                    // 响铃模式沿用精确闹钟；到时由前台服务播放短响。
                    Calendar due = Calendar.getInstance(); due.add(Calendar.MINUTE, leadMinutes);
                    due.set(Calendar.SECOND, 0); due.set(Calendar.MILLISECOND, 0);
                    TrainingScheduler.replace(context, true, 1 << (isoWeekday(due) - 1), due.get(Calendar.HOUR_OF_DAY), due.get(Calendar.MINUTE), "ring", "");
                    waitUntil("Natural due time did not start the ringing service", () -> TrainingRingingService.isRinging());
                    break;
                }
                case "status":
                    result.putBoolean("exact", TrainingScheduler.exactPermitted(context));
                    result.putBoolean("notifications", TrainingScheduler.permitted(context));
                    result.putBoolean("sound", TrainingScheduler.soundPermitted(context));
                    result.putBoolean("ringChannel", TrainingScheduler.ringChannelEnabled(context));
                    result.putInt("alarmVolume", TrainingScheduler.alarmVolume(context));
                    result.putInt("alarmVolumeMax", TrainingScheduler.alarmVolumeMax(context));
                    result.putString("ringerMode", TrainingScheduler.ringerMode(context));
                    result.putBoolean("dndKnown", TrainingScheduler.dndActive(context) != null);
                    result.putStringArray("blockers", TrainingScheduler.ringBlockers(context).toArray(new String[0]));
                    result.putStringArray("unverified", TrainingScheduler.ringUnverified(context).toArray(new String[0]));
                    break;
                case "arrange": TrainingScheduler.replace(context, true, 5, 18, 30, "notification", ""); break;
                case "modify": TrainingScheduler.replace(context, true, 16, 19, 0, "notification", ""); break;
                case "ringArrange": {
                    TrainingScheduler.replace(context, true, 5, 18, 30, "ring", "");
                    if (!"ring".equals(TrainingScheduler.savedMode(context))) throw new AssertionError("Ringing mode was not persisted");
                    if (TrainingRingingService.isRinging()) throw new AssertionError("Arranging must not start ringing");
                    break;
                }
                case "ringSwitch": {
                    // 切换模式必须先结束旧代次：正在响时切回普通通知应立即停止。
                    deliverAlarm(context, "ring", "");
                    waitUntil("Ringing did not start before the mode switch", () -> TrainingRingingService.isRinging());
                    TrainingScheduler.replace(context, true, 5, 18, 30, "notification", "");
                    if (TrainingRingingService.isRinging()) throw new AssertionError("Switching mode left the ringing playing");
                    waitUntil("Switching mode left the ringing notification", () -> notifications.getActiveNotifications().length == 0);
                    if (!"notification".equals(TrainingScheduler.savedMode(context))) throw new AssertionError("Mode switch was not persisted");
                    break;
                }
                case "ringDeliver": {
                    deliverAlarm(context, "ring", "");
                    waitUntil("Ringing did not start", () -> TrainingRingingService.isRinging());
                    waitUntil("Ringing did not post its notification", () -> notifications.getActiveNotifications().length == 1);
                    break;
                }
                case "ringStop": {
                    deliverAlarm(context, "ring", "");
                    waitUntil("Ringing did not start", () -> TrainingRingingService.isRinging());
                    TrainingScheduler.stopRinging(context);
                    waitUntil("Stopping did not end the ringing", () -> !TrainingRingingService.isRinging());
                    waitUntil("Stopping left the ringing notification", () -> notifications.getActiveNotifications().length == 0);
                    break;
                }
                case "ringExpiry": {
                    // 到时短响固定 10 秒上限，达到上限自动停止并保留这次训练通知。
                    deliverAlarm(context, "ring", "");
                    waitUntil("Ringing did not start", () -> TrainingRingingService.isRinging());
                    waitUntil("Ringing did not stop at the 10 second cap", () -> !TrainingRingingService.isRinging());
                    if (notifications.getActiveNotifications().length == 0) throw new AssertionError("Expiry dropped the training notification");
                    break;
                }
                case "ringFallback": {
                    // 铃声标识失效时回退系统默认闹钟铃声，并留下提示而不是宣称按所选铃声响。
                    deliverAlarm(context, "ring", "content://org.fatloss.reminders/missing-ringtone");
                    waitUntil("Fallback ringing did not start", () -> TrainingRingingService.isRinging());
                    if (!TrainingScheduler.ringFallback(context)) throw new AssertionError("Invalid ringtone was not reported as a fallback");
                    TrainingScheduler.stopRinging(context);
                    break;
                }
                case "ringBlocked": {
                    // 静音、勿扰或音量为零时不得主动响铃，只保留通知。
                    List<String> blockers = TrainingScheduler.ringBlockers(context);
                    if (blockers.isEmpty()) throw new AssertionError("Blocked scenario needs a blocking system state");
                    deliverAlarm(context, "ring", "");
                    Thread.sleep(1500);
                    if (TrainingRingingService.isRinging()) throw new AssertionError("Ringing played while the system state blocks it");
                    break;
                }
                case "staleRing": {
                    // 改期后的旧交接不得再响。
                    Calendar due = Calendar.getInstance();
                    TrainingScheduler.replace(context, true, 1 << (isoWeekday(due) - 1), due.get(Calendar.HOUR_OF_DAY), due.get(Calendar.MINUTE), "ring", "");
                    int stale = prefs(context).getInt("generation", 0) - 1;
                    TrainingScheduler.replace(context, true, 1 << (isoWeekday(due) - 1), 9, 0, "ring", "");
                    context.sendBroadcast(new Intent(context, TrainingAlarmReceiver.class).setAction(TrainingScheduler.ACTION)
                            .putExtra("weekday", isoWeekday(due)).putExtra("generation", stale).putExtra("occurrence", System.currentTimeMillis()));
                    Thread.sleep(1000);
                    if (TrainingRingingService.isRinging()) throw new AssertionError("Replaced alarm started a stale ring");
                    break;
                }
                case "restore": TrainingScheduler.restore(context); break;
                case "deliver": {
                    int generation = prefs(context).getInt("generation", 0);
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
                    int generation = prefs(context).getInt("generation", 0);
                    context.sendBroadcast(new Intent(context, TrainingAlarmReceiver.class).setAction(TrainingScheduler.ACTION).putExtra("weekday", 5).putExtra("generation", generation - 1));
                    Thread.sleep(500);
                    if (notifications.getActiveNotifications().length != 0) throw new AssertionError("Replaced alarm posted a stale notification");
                    break;
                }
                case "close":
                    TrainingScheduler.replace(context, false, 0, 0, 0, "ring", "");
                    if (TrainingRingingService.isRinging()) throw new AssertionError("Closing the reminder left the ringing playing");
                    if (notifications.getActiveNotifications().length != 0) throw new AssertionError("Closing reminder left a notification");
                    break;
                case "denied": {
                    if (TrainingScheduler.permitted(context)) throw new AssertionError("System notification denial was not detected");
                    boolean rejected = false;
                    try { TrainingScheduler.replace(context, true, 5, 18, 30, "notification", ""); }
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
