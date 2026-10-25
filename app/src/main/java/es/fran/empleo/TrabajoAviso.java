package es.fran.empleo;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.TimeUnit;

/** Muestra un aviso en una fecha concreta (por ejemplo, renovar la demanda de empleo). */
public class TrabajoAviso extends Worker {

    public TrabajoAviso(@NonNull Context c, @NonNull WorkerParameters p) {
        super(c, p);
    }

    static void programar(Context ctx, String id, long cuando, String titulo, String texto) {
        long espera = Math.max(0, cuando - System.currentTimeMillis());
        Data datos = new Data.Builder().putString("titulo", titulo).putString("texto", texto).build();
        OneTimeWorkRequest r = new OneTimeWorkRequest.Builder(TrabajoAviso.class)
                .setInitialDelay(espera, TimeUnit.MILLISECONDS)
                .setInputData(datos)
                .build();
        WorkManager.getInstance(ctx).enqueueUniqueWork("aviso-" + id, ExistingWorkPolicy.REPLACE, r);
    }

    static void cancelar(Context ctx, String id) {
        WorkManager.getInstance(ctx).cancelUniqueWork("aviso-" + id);
    }

    @NonNull
    @Override
    public Result doWork() {
        TrabajoCorreo.notificar(getApplicationContext(),
                getInputData().getString("titulo"), getInputData().getString("texto"));
        return Result.success();
    }
}
