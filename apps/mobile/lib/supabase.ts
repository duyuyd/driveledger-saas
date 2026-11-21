import "react-native-url-polyfill/auto";
import { createClient, processLock } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";

const url=process.env.EXPO_PUBLIC_SUPABASE_URL;
const key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const backendConfigured=Boolean(url?.startsWith("https://")&&key);
export const db=backendConfigured?createClient(url!,key!,{
  auth:{storage:AsyncStorage,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false,lock:processLock}
}):null;
if(db){
  AppState.addEventListener("change",state=>{
    if(state==="active")db.auth.startAutoRefresh();
    else db.auth.stopAutoRefresh();
  });
}
