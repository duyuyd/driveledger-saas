import "react-native-url-polyfill/auto";
import { createClient, processLock } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
const url=process.env.EXPO_PUBLIC_SUPABASE_URL;
const key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if(!url||!key)throw new Error("Chưa cấu hình EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
export const db=createClient(url,key,{
  auth:{storage:AsyncStorage,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false,lock:processLock}
});
AppState.addEventListener("change",state=>{
  if(state==="active")db.auth.startAutoRefresh();
  else db.auth.stopAutoRefresh();
});
