// src/lib/data-manager.ts
import { supabase } from './supabase';

// The AppData interface defines the structure of our user's settings.
interface AppData {
  folders: any[];
  actionButtons: any[];
  trainings: any[];
  statistics: any[];
  charts: any[];
}

/**
 * Gathers all relevant data from localStorage.
 * This is the data that will be synced with Supabase.
 */
const gatherDataFromLocalStorage = (): AppData => {
  const folders = JSON.parse(localStorage.getItem('poker-ranges-folders') || '[]');
  const actionButtons = JSON.parse(localStorage.getItem('poker-ranges-actions') || '[]');
  const trainings = JSON.parse(localStorage.getItem('training-sessions') || '[]');
  const statistics = JSON.parse(localStorage.getItem('training-statistics') || '[]');
  const charts = JSON.parse(localStorage.getItem('userCharts') || '[]');

  return { folders, actionButtons, trainings, statistics, charts };
};

/**
 * Applies synced data to localStorage and reloads the application.
 */
const applyDataToLocalStorage = (data: Partial<AppData>) => {
  // We only apply data if it's provided to avoid overwriting with undefined.
  if (data.folders) localStorage.setItem('poker-ranges-folders', JSON.stringify(data.folders));
  if (data.actionButtons) localStorage.setItem('poker-ranges-actions', JSON.stringify(data.actionButtons));
  if (data.trainings) localStorage.setItem('training-sessions', JSON.stringify(data.trainings));
  if (data.statistics) localStorage.setItem('training-statistics', JSON.stringify(data.statistics));
  if (data.charts) localStorage.setItem('userCharts', JSON.stringify(data.charts));

  alert("Настройки успешно синхронизированы! Приложение будет перезагружено.");
  
  setTimeout(() => window.location.reload(), 250);
};

/**
 * Uploads the current user settings from localStorage to Supabase.
 * This function can be used for manual "Save to Cloud" functionality.
 */
export const exportUserSettings = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert("Для сохранения настроек в облако необходимо войти в аккаунт.");
    return;
  }

  console.log("Uploading settings to Supabase for user:", user.id);
  const settingsData = gatherDataFromLocalStorage();

  const { error } = await supabase
    .from('user_settings')
    .upsert({
      user_id: user.id,
      ...settingsData,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) {
    console.error('Error uploading settings:', error);
    alert(`Ошибка сохранения настроек: ${error.message}`);
  } else {
    console.log('Settings uploaded successfully.');
    alert('Настройки успешно сохранены в облаке!');
  }
};

/**
 * Fetches user settings from Supabase and applies them to localStorage.
 * This function replaces the old file import functionality and is called on login.
 */
export const importUserSettings = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.log("User not logged in, cannot import settings.");
    return;
  }

  console.log("Importing settings from Supabase for user:", user.id);

  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') { // 'PGRST116' means no rows found
    console.error('Error importing settings:', error);
    alert(`Ошибка загрузки настроек: ${error.message}`);
    return;
  }

  if (data) {
    console.log("Settings found in Supabase, applying to local storage.");
    const { user_id, updated_at, ...settingsData } = data;
    applyDataToLocalStorage(settingsData);
  } else {
    console.log("No settings found in Supabase for this user. Checking for local data to perform initial sync.");
    const localData = gatherDataFromLocalStorage();
    const hasLocalData = Object.values(localData).some(arr => arr.length > 0);

    if (hasLocalData) {
      console.log("Local data found. Performing initial upload.");
      await uploadInitialSettings(user.id, localData);
    } else {
      console.log("No remote or local settings found. Fresh start.");
    }
  }
};

/**
 * Helper for the very first sync from local to remote.
 */
const uploadInitialSettings = async (userId: string, settingsData: AppData) => {
    const { error } = await supabase
    .from('user_settings')
    .upsert({
      user_id: userId,
      ...settingsData,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) {
    console.error('Error on initial upload:', error);
    alert(`Ошибка первоначальной синхронизации: ${error.message}`);
  } else {
    alert("Ваши локальные настройки были успешно сохранены в облаке!");
  }
}
