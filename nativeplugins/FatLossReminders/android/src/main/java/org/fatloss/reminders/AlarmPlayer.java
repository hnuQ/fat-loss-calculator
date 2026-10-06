package org.fatloss.reminders;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

/** 独立的闹钟用途播放器：先申请音频焦点，被拒绝不播放，失去焦点或结束立即释放。 */
final class AlarmPlayer {
    interface Listener { void onAudioFocusLost(); }

    static final AudioAttributes ALARM_ATTRIBUTES = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

    private final Handler handler = new Handler(Looper.getMainLooper());
    private MediaPlayer player;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private AudioManager.OnAudioFocusChangeListener focusListener;
    private Listener listener;

    boolean isPlaying() { return player != null; }

    /** 只有拿到音频焦点并成功开始播放才返回 true；任何失败都会释放已占用资源。 */
    boolean start(Context context, Uri uri, boolean looping, Listener onFocusLost) {
        stop();
        listener = onFocusLost;
        if (!requestFocus(context)) return false;
        try {
            MediaPlayer created = new MediaPlayer();
            created.setAudioAttributes(ALARM_ATTRIBUTES);
            created.setDataSource(context, uri);
            created.setLooping(looping);
            created.prepare();
            created.start();
            player = created;
            return true;
        } catch (Exception failure) {
            abandonFocus();
            return false;
        }
    }

    void stop() {
        MediaPlayer current = player;
        player = null;
        if (current != null) {
            try { current.stop(); } catch (Exception ignored) { }
            current.release();
        }
        abandonFocus();
    }

    private boolean requestFocus(Context context) {
        audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) return false;
        focusListener = change -> {
            if (change != AudioManager.AUDIOFOCUS_LOSS && change != AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) return;
            Listener current = listener;
            if (current != null) current.onAudioFocusLost();
        };
        try {
            int result;
            if (Build.VERSION.SDK_INT >= 26) {
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                        .setAudioAttributes(ALARM_ATTRIBUTES)
                        .setOnAudioFocusChangeListener(focusListener, handler)
                        .build();
                result = audioManager.requestAudioFocus(focusRequest);
            } else {
                result = audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
            }
            if (result != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { focusListener = null; focusRequest = null; return false; }
            return true;
        } catch (Exception failure) {
            focusListener = null; focusRequest = null;
            return false;
        }
    }

    private void abandonFocus() {
        AudioManager manager = audioManager;
        audioManager = null;
        if (manager == null) return;
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                if (focusRequest != null) manager.abandonAudioFocusRequest(focusRequest);
            } else if (focusListener != null) {
                manager.abandonAudioFocus(focusListener);
            }
        } catch (Exception ignored) { }
        focusRequest = null;
        focusListener = null;
    }
}
