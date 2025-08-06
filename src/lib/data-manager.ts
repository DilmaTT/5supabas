// src/lib/data-manager.ts
import { supabase } from './supabaseClient';

// --- Data Structure ---
interface AppData {
  version: number;
  folders: any[];
  actionButtons: any[];
  trainings: any[];
  statistics: any[];
  charts: any[];
  timestamp: string;
}

const APP_DATA_VERSION = 1;

// --- Helper Functions ---
const isTauri = (): boolean => '__TAURI__' in window;
const isCapacitor = (): boolean => !!(window as any).Capacitor?.isNativePlatform();

/**
 * Gathers all relevant data from localStorage into a single object.
 */
const gatherData = (): AppData => {
  const folders = JSON.parse(localStorage.getItem('poker-ranges-folders') || '[]');
  const actionButtons = JSON.parse(localStorage.getItem('poker-ranges-actions') || '[]');
  const trainings = JSON.parse(localStorage.getItem('training-sessions') || '[]');
  const statistics = JSON.parse(localStorage.getItem('training-statistics') || '[]');
  const charts = JSON.parse(localStorage.getItem('userCharts') || '[]');

  return {
    version: APP_DATA_VERSION,
    folders,
    actionButtons,
    trainings,
    statistics,
    charts,
    timestamp: new Date().toISOString(),
  };
};

/**
 * Applies imported data to the application.
 */
const applyData = (data: AppData, reload: boolean = true) => {
  if (!data || data.version > APP_DATA_VERSION) {
    console.error("Invalid or newer data format.");
    alert("Ошибка: Неверный или более новый формат файла настроек, который не поддерживается этой версией приложения.");
    return;
  }

  localStorage.setItem('poker-ranges-folders', JSON.stringify(data.folders || []));
  localStorage.setItem('poker-ranges-actions', JSON.stringify(data.actionButtons || []));
  localStorage.setItem('training-sessions', JSON.stringify(data.trainings || []));
  localStorage.setItem('training-statistics', JSON.stringify(data.statistics || []));
  localStorage.setItem('userCharts', JSON.stringify(data.charts || []));

  if (reload) {
    alert("Настройки успешно импортированы! Приложение будет перезагружено.");
    setTimeout(() => {
      window.location.reload();
    }, 250);
  }
};

// --- Supabase Data Management ---

export const syncDataToSupabase = async (showAlert = true) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    if (showAlert) alert("Вы должны войти в систему для синхронизации данных.");
    return;
  }

  const appData = gatherData();
  const { version, timestamp, ...userData } = appData;

  const { error } = await supabase
    .from('user_data')
    .upsert({
      user_id: user.id,
      folders: userData.folders,
      action_buttons: userData.actionButtons,
      trainings: userData.trainings,
      statistics: userData.statistics,
      charts: userData.charts,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) {
    console.error("Error syncing data to Supabase:", error);
    if (showAlert) alert("Ошибка синхронизации данных с облаком.");
  } else {
    if (showAlert) alert("Данные успешно сохранены в облаке!");
  }
};

export const loadDataFromSupabase = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.log("No user session, cannot load data from Supabase.");
    return;
  }

  const { data, error } = await supabase
    .from('user_data')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
    console.error("Error loading data from Supabase:", error);
    alert("Ошибка загрузки данных из облака.");
    return;
  }

  if (data) {
    const localTimestamp = localStorage.getItem('poker-data-timestamp');
    const cloudTimestamp = data.updated_at;

    if (!localTimestamp || new Date(cloudTimestamp) > new Date(localTimestamp)) {
        if (confirm("Найдены более новые данные в облаке. Загрузить их? Это перезапишет ваши текущие локальные несохраненные данные.")) {
            const appData: AppData = {
              version: APP_DATA_VERSION,
              folders: data.folders || [],
              actionButtons: data.action_buttons || [],
              trainings: data.trainings || [],
              statistics: data.statistics || [],
              charts: data.charts || [],
              timestamp: data.updated_at || new Date().toISOString(),
            };
            applyData(appData); // This will reload the page
        }
    } else {
        alert("Ваши локальные данные актуальны.");
    }
  } else {
    console.log("No data found in Supabase for this user. Using local data.");
    if (confirm("В облаке нет данных. Хотите сохранить текущие локальные данные в облако?")) {
        await syncDataToSupabase();
    }
  }
};

export const clearLocalData = () => {
  localStorage.removeItem('poker-ranges-folders');
  localStorage.removeItem('poker-ranges-actions');
  localStorage.removeItem('training-sessions');
  localStorage.removeItem('training-statistics');
  localStorage.removeItem('userCharts');
  localStorage.removeItem('poker-data-timestamp');
  window.location.reload();
};


// --- Platform-Specific File Export Implementations ---

const exportForWeb = (appData: AppData) => {
  const dataStr = JSON.stringify(appData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `poker-settings-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const exportForTauri = async (appData: AppData) => {
  try {
    const { save } = await import('@tauri-apps/api/dialog');
    const { writeTextFile } = await import('@tauri-apps/api/fs');
    
    const filePath = await save({
      defaultPath: `poker-settings-backup-${new Date().toISOString().split('T')[0]}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (filePath) {
      const dataStr = JSON.stringify(appData, null, 2);
      await writeTextFile(filePath, dataStr);
      alert('Настройки успешно экспортированы!');
    }
  } catch (error) {
    console.error('Failed to export settings via Tauri:', error);
    alert('Ошибка экспорта настроек.');
  }
};

const exportForCapacitor = async (appData: AppData) => {
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const permissionStatus = await Filesystem.requestPermissions();
    if (permissionStatus.publicStorage !== 'granted') {
      alert('Для экспорта настроек необходимо разрешение на доступ к хранилищу.');
      return;
    }
    const dataStr = JSON.stringify(appData, null, 2);
    const fileName = `poker-settings-backup-${new Date().toISOString()}.json`;
    await Filesystem.writeFile({
      path: fileName,
      data: dataStr,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    alert(`Настройки сохранены в папку "Документы" под именем: ${fileName}`);
  } catch (error) {
    console.error('Failed to export settings via Capacitor:', error);
    alert('Ошибка экспорта настроек. Проверьте разрешения приложения.');
  }
};

// --- Platform-Specific File Import Implementations ---

const importForWeb = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          applyData(data);
        } catch (err) {
          console.error("Error parsing JSON file.", err);
          alert("Ошибка: Не удалось прочитать файл.");
        }
      };
      reader.readAsText(file);
    }
  };
  input.click();
};

const importForTauri = async () => {
  try {
    const { open } = await import('@tauri-apps/api/dialog');
    const { readTextFile } = await import('@tauri-apps/api/fs');
    const selected = await open({
      multiple: false,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (typeof selected === 'string' && selected) {
      const contents = await readTextFile(selected);
      const data = JSON.parse(contents);
      applyData(data);
    }
  } catch (error) {
    console.error('Failed to import settings via Tauri:', error);
    alert('Ошибка импорта настроек.');
  }
};

const importForCapacitor = () => {
  importForWeb();
};

// --- Public API for File I/O ---

export const exportDataToFile = () => {
  const appData = gatherData();
  if (isTauri()) {
    exportForTauri(appData);
  } else if (isCapacitor()) {
    exportForCapacitor(appData);
  } else {
    exportForWeb(appData);
  }
};

export const importDataFromFile = () => {
  if (isTauri()) {
    importForTauri();
  } else if (isCapacitor()) {
    importForCapacitor();
  } else {
    importForWeb();
  }
};

export const downloadCloudBackup = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert("Вы должны войти в систему, чтобы скачать бэкап из облака.");
    return;
  }

  try {
    const { data, error } = await supabase
      .from('user_data')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      throw error;
    }

    if (data) {
      const appData: AppData = {
        version: APP_DATA_VERSION,
        folders: data.folders || [],
        actionButtons: data.action_buttons || [],
        trainings: data.trainings || [],
        statistics: data.statistics || [],
        charts: data.charts || [],
        timestamp: data.updated_at || new Date().toISOString(),
      };
      exportForWeb(appData);
    } else {
      alert("В облаке нет данных для скачивания.");
    }
  } catch (error) {
    console.error("Error downloading cloud backup:", error);
    alert("Ошибка загрузки бэкапа из облака.");
  }
};
