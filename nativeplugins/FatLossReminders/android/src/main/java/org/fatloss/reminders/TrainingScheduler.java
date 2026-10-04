package org.fatloss.reminders;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import java.util.Calendar;

/** Seven stable alarms, persisted desired state, and no server or exercise data. */
public final class TrainingScheduler {
    static final String ACTION = "org.fatloss.reminders.TRAINING";
    private static final String PREFS = "fat-loss-training-reminders-v1";
    private static final String CHANNEL = "fat-loss-training";
    private static final int BASE_ID = 7100;

    private TrainingScheduler() {}
    private static SharedPreferences prefs(Context context) { return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private static NotificationManager manager(Context context) { return (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE); }

    static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT >= 26) manager(context).createNotificationChannel(new NotificationChannel(CHANNEL, "训练提醒", NotificationManager.IMPORTANCE_DEFAULT));
    }

    static boolean permitted(Context context) {
        createChannel(context);
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        if (Build.VERSION.SDK_INT >= 24 && !manager(context).areNotificationsEnabled()) return false;
        return Build.VERSION.SDK_INT < 26 || manager(context).getNotificationChannel(CHANNEL).getImportance() != NotificationManager.IMPORTANCE_NONE;
    }

    static boolean exactPermitted(Context context) {
        return Build.VERSION.SDK_INT < 31 || ((AlarmManager) context.getSystemService(Context.ALARM_SERVICE)).canScheduleExactAlarms();
    }

    static boolean soundPermitted(Context context) {
        createChannel(context);
        if (Build.VERSION.SDK_INT < 26) return true;
        NotificationChannel channel = manager(context).getNotificationChannel(CHANNEL);
        return channel.getImportance() >= NotificationManager.IMPORTANCE_DEFAULT && channel.getSound() != null;
    }

    private static PendingIntent alarmIntent(Context context, int weekday, int generation, long occurrence) {
        Intent intent = new Intent(context, TrainingAlarmReceiver.class).setAction(ACTION);
        intent.putExtra("weekday", weekday).putExtra("generation", generation).putExtra("occurrence", occurrence);
        return PendingIntent.getBroadcast(context, BASE_ID + weekday, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static long nextOccurrence(int isoWeekday, int hour, int minute, long now) {
        Calendar next = Calendar.getInstance(); next.setTimeInMillis(now);
        next.set(Calendar.HOUR_OF_DAY, hour); next.set(Calendar.MINUTE, minute);
        next.set(Calendar.SECOND, 0); next.set(Calendar.MILLISECOND, 0);
        int javaWeekday = isoWeekday == 7 ? Calendar.SUNDAY : isoWeekday + 1;
        int days = (javaWeekday - next.get(Calendar.DAY_OF_WEEK) + 7) % 7;
        next.add(Calendar.DAY_OF_MONTH, days);
        if (next.getTimeInMillis() <= now) next.add(Calendar.DAY_OF_MONTH, 7);
        return next.getTimeInMillis();
    }

    private static void cancelAll(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        for (int day = 1; day <= 7; day++) {
            PendingIntent pending = alarmIntent(context, day, 0, 0);
            alarms.cancel(pending); pending.cancel();
            manager(context).cancel(BASE_ID + day);
        }
    }

    private static void schedule(Context context, int day, SharedPreferences state) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        long when = nextOccurrence(day, state.getInt("hour", 0), state.getInt("minute", 0), System.currentTimeMillis());
        PendingIntent pending = alarmIntent(context, day, state.getInt("generation", 0), when);
        if (exactPermitted(context)) {
            try { alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pending); return; }
            catch (SecurityException revoked) { /* Permission may change between checking and scheduling. */ }
        }
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pending);
    }

    static synchronized void replace(Context context, boolean enabled, int mask, int hour, int minute) {
        if (enabled && !permitted(context)) throw new IllegalStateException("通知权限或训练通知渠道未启用");
        if (enabled && (mask < 1 || mask > 127 || hour < 0 || hour > 23 || minute < 0 || minute > 59)) throw new IllegalArgumentException("训练星期或时间无效");
        SharedPreferences state = prefs(context);
        int generation = state.getInt("generation", 0) + 1;
        if (!state.edit().putBoolean("enabled", enabled).putInt("mask", enabled ? mask : 0).putInt("hour", hour).putInt("minute", minute).putInt("generation", generation).commit()) throw new IllegalStateException("保存系统训练提醒失败");
        cancelAll(context);
        if (enabled) for (int day = 1; day <= 7; day++) if ((mask & (1 << (day - 1))) != 0) schedule(context, day, state);
    }

    static synchronized void restore(Context context) {
        SharedPreferences state = prefs(context);
        cancelAll(context);
        if (state.getBoolean("enabled", false) && permitted(context)) {
            for (int day = 1; day <= 7; day++) if ((state.getInt("mask", 0) & (1 << (day - 1))) != 0) schedule(context, day, state);
        }
    }

    static synchronized void deliver(Context context, Intent intent) {
        SharedPreferences state = prefs(context);
        int day = intent.getIntExtra("weekday", 0);
        long occurrence = intent.getLongExtra("occurrence", 0);
        if (day < 1 || day > 7 || !state.getBoolean("enabled", false) || intent.getIntExtra("generation", -1) != state.getInt("generation", 0) || (state.getInt("mask", 0) & (1 << (day - 1))) == 0) return;
        if (occurrence <= 0 || System.currentTimeMillis() < occurrence || state.getLong("delivered-" + day, 0) >= occurrence) return;
        // Re-arm before notifying, so revoking permission never produces a stale notification.
        schedule(context, day, state);
        if (!permitted(context)) return;
        if (!state.edit().putLong("delivered-" + day, occurrence).commit()) throw new IllegalStateException("保存训练通知状态失败");
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        Notification.Builder notification = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, CHANNEL) : new Notification.Builder(context);
        notification.setSmallIcon(context.getApplicationInfo().icon).setContentTitle("训练提醒").setContentText("到了你设置的训练时间，可查看自己的训练计划。").setAutoCancel(true);
        if (Build.VERSION.SDK_INT < 26) notification.setDefaults(Notification.DEFAULT_SOUND);
        if (launch != null) notification.setContentIntent(PendingIntent.getActivity(context, BASE_ID, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        manager(context).notify(BASE_ID + day, notification.build());
    }
}
