package org.fatloss.reminders;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class TrainingAlarmReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (TrainingScheduler.ACTION.equals(intent.getAction())) {
            TrainingScheduler.deliver(context, intent);
        } else {
            TrainingScheduler.restore(context);
        }
    }
}
