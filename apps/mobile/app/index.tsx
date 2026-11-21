import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Alert, ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import * as Crypto from "expo-crypto";
import type { Session } from "@supabase/supabase-js";
import { db as optionalDb, backendConfigured } from "../lib/supabase";
const db=optionalDb!;
import { distanceMeters, plausibleHop } from "../lib/gps.mjs";

type Org = { id:string;name:string };
type Student = {id:string;full_name:string;phone:string;license_class:string;target_km:number;completed_distance_m:number};
type Vehicle = {id:string;plate:string};
type Ledger = {id:string;kind:"income"|"expense";status:"pending"|"confirmed";category:string;amount_vnd:number;recorded_at:string};
type Tab = "home"|"students"|"ledger"|"gps";
type GeoPoint = {trip_id:string;created_by:string;captured_at:string;latitude:number;longitude:number;accuracy_m:number};
const BrandContext=createContext({name:"DriveLedger",color:"#2563eb",developer:"NPT duy"});
const money=(n:number)=>new Intl.NumberFormat("vi-VN",{maximumFractionDigits:0}).format(n)+" ₫";
function Input({label,value,onChangeText,keyboardType,secureTextEntry,placeholder}:{label:string;value:string;onChangeText:(s:string)=>void;keyboardType?:"numeric"|"email-address"|"default";secureTextEntry?:boolean;placeholder?:string}){
  return <View style={{marginBottom:13}}><Text style={styles.label}>{label}</Text><TextInput style={styles.input} value={value} onChangeText={onChangeText} keyboardType={keyboardType} secureTextEntry={secureTextEntry} autoCapitalize="none" placeholder={placeholder} placeholderTextColor="#94a3b8"/></View>;
}
function Button({title,onPress,disabled,secondary,danger}:{title:string;onPress:()=>void|Promise<void>;disabled?:boolean;secondary?:boolean;danger?:boolean}){
  const brand=useContext(BrandContext);
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.button,{backgroundColor:brand.color},secondary&&styles.secondary,danger&&styles.danger,disabled&&{opacity:.45}]}><Text style={[styles.buttonText,secondary&&{color:"#172b4c"}]}>{title}</Text></Pressable>;
}
function Choice({selected,label,onPress}:{selected:boolean;label:string;onPress:()=>void}){
  const brand=useContext(BrandContext);
  return <Pressable onPress={onPress} style={[styles.choice,selected&&{backgroundColor:brand.color}]}><Text style={[styles.choiceText,selected&&{color:"#fff"}]}>{label}</Text></Pressable>;
}

export default function MainScreen(){
  const [brand,setBrand]=useState({name:"DriveLedger",color:"#2563eb",developer:"NPT duy"});
  useEffect(()=>{
    if(!backendConfigured)return;
    let alive=true;
    void db.from("platform_settings").select("key,value").in("key",["site_title","brand_color","developer_name"]).then(({data})=>{
      if(!alive)return;
      const settings=Object.fromEntries((data??[]).map(s=>[s.key,s.value]));
      setBrand({name:typeof settings.site_title==="string"?settings.site_title:"DriveLedger",
        color:typeof settings.brand_color==="string"&&/^#[0-9a-fA-F]{6}$/.test(settings.brand_color)?settings.brand_color:"#2563eb",developer:typeof settings.developer_name==="string"?settings.developer_name:"NPT duy"});
    });
    return ()=>{alive=false;};
  },[]);
  if(!backendConfigured) return <SafeAreaView style={styles.root}>
    <View style={{flex:1,justifyContent:"center",padding:26}}>
      <Text style={styles.logo}>🚘 DriveLedger v0.2.0</Text>
      <Text style={[styles.heading,{marginTop:18}]}>Đang thiết lập dữ liệu</Text>
      <Text style={styles.sub}>Bản Android đã được đóng gói, nhưng máy chủ Supabase riêng chưa được kích hoạt. Chưa thể đăng nhập, quản lý học viên hoặc ghi GPS.</Text>
      <Text style={[styles.sub,{marginTop:24}]}>Nhà phát triển: NPT duy</Text>
    </View>
  </SafeAreaView>;
  return <BrandContext.Provider value={brand}><MainContent/></BrandContext.Provider>;
}
function MainContent(){
  const brand=useContext(BrandContext);
  const [session,setSession]=useState<Session|null>(null);
  const [ready,setReady]=useState(false);
  const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
  const [orgs,setOrgs]=useState<Org[]>([]); const [orgId,setOrgId]=useState<string|null>(null);
  const [tab,setTab]=useState<Tab>("home");
  const [students,setStudents]=useState<Student[]>([]); const [vehicles,setVehicles]=useState<Vehicle[]>([]);
  const [ledger,setLedger]=useState<Ledger[]>([]);
  const [summary,setSummary]=useState<{income_vnd:number;expense_vnd:number;student_count:number;gps_distance_m:number}|null>(null);
  const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
  const [studentName,setStudentName]=useState(""); const [studentPhone,setStudentPhone]=useState("");
  const [kind,setKind]=useState<"income"|"expense">("income"); const [amount,setAmount]=useState("");
  const [category,setCategory]=useState(""); const [method,setMethod]=useState<"cash"|"transfer">("cash");
  const [reference,setReference]=useState(""); const [confirmed,setConfirmed]=useState(true);
  const [chosenStudent,setChosenStudent]=useState<string|null>(null);
  const [chosenVehicle,setChosenVehicle]=useState<string|null>(null);
  const [tripId,setTripId]=useState<string|null>(null);
  const [liveMeters,setLiveMeters]=useState(0);
  const gpsWatch=useRef<Location.LocationSubscription|null>(null);
  const currentTrip=useRef<string|null>(null);
  const lastFix=useRef<{latitude:number;longitude:number;timestamp:number}|null>(null);
  const pointQueue=useRef<GeoPoint[]>([]);
  const flushing=useRef<Promise<void>|null>(null);
  const pendingTransactionKey=useRef<string|null>(null);

  useEffect(()=>{
    let alive=true;
    db.auth.getSession().then(({data})=>{if(alive){setSession(data.session);setReady(true);}})
      .catch(()=>{if(alive){setReady(true);setMessage("Không lấy được phiên đăng nhập");}});
    const {data:{subscription}}=db.auth.onAuthStateChange((_event,newSession)=>{if(alive)setSession(newSession);});
    return ()=>{alive=false;subscription.unsubscribe();gpsWatch.current?.remove();};
  },[]);

  const loadOrganizations=useCallback(async()=>{
    const {data,error}=await db.from("organizations").select("id,name").order("created_at",{ascending:true});
    if(error)throw new Error(error.message);
    const list=(data??[]) as Org[];
    setOrgs(list);
    setOrgId(old=>old&&list.some(o=>o.id===old)?old:(list[0]?.id??null));
  },[]);
  useEffect(()=>{if(session?.user.id)void loadOrganizations().catch(e=>setMessage(String(e)));else{setOrgs([]);setOrgId(null);}},[session?.user.id,loadOrganizations]);
  const loadOrgData=useCallback(async(id:string)=>{
    const now=new Date();
    const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit"}).formatToParts(now);
    const year=parts.find(p=>p.type==="year")?.value??"2026",mon=parts.find(p=>p.type==="month")?.value??"01";
    const month=`${year}-${mon}-01`;
    const results=await Promise.all([
      db.from("student_mileage").select("id,full_name,phone,license_class,target_km,completed_distance_m").eq("organization_id",id).eq("archived",false).order("full_name").limit(100),
      db.from("vehicles").select("id,plate").eq("organization_id",id).eq("active",true).order("plate").limit(100),
      db.from("transactions").select("id,kind,status,category,amount_vnd,recorded_at").eq("organization_id",id).order("recorded_at",{ascending:false}).limit(30),
      db.rpc("get_month_summary",{p_org:id,p_month:month}).single(),
      db.from("trips").select("id").eq("organization_id",id).eq("status","active").eq("created_by",session?.user.id??"").limit(1).maybeSingle(),
    ]);
    for(const r of results)if(r.error)throw new Error(r.error.message);
    setStudents((results[0].data??[]) as Student[]);
    setVehicles((results[1].data??[]) as Vehicle[]);
    setLedger((results[2].data??[]) as Ledger[]);
    setSummary(results[3].data as typeof summary);
    const active=results[4].data?.id??null;setTripId(active);currentTrip.current=active;
  },[session?.user.id]);
  useEffect(()=>{if(orgId&&session)void loadOrgData(orgId).catch(e=>setMessage(String(e)));},[orgId,session?.user.id,loadOrgData]);

  async function authenticate(signUp:boolean){
    if(!email.includes("@")||password.length<8){setMessage("Cần email hợp lệ và mật khẩu ít nhất 8 ký tự");return;}
    setBusy(true);setMessage("");
    try{
      if(signUp){
        const {data:flag,error:flagError}=await db.from("platform_settings").select("value").eq("key","feature_registration").maybeSingle();
        if(flagError)throw new Error(flagError.message);
        if(flag?.value===false)throw new Error("Hệ thống tạm đóng đăng ký tài khoản mới");
      }
      const res=signUp?await db.auth.signUp({email:email.trim().toLowerCase(),password}):await db.auth.signInWithPassword({email:email.trim().toLowerCase(),password});
      if(res.error)throw new Error(res.error.message);
      if(signUp&&!res.data.session)setMessage("Kiểm tra email xác nhận rồi đăng nhập lại.");
    }catch(e){setMessage(String(e));}finally{setBusy(false);}
  }
  async function addStudent(){
    if(!orgId||studentName.trim().length<2){setMessage("Tên học viên phải có ít nhất hai ký tự");return;}
    setBusy(true);setMessage("");
    try{
      const {error}=await db.from("students").insert({organization_id:orgId,full_name:studentName.trim(),phone:studentPhone.trim(),license_class:"B"});
      if(error)throw new Error(error.message);
      setStudentName("");setStudentPhone("");await loadOrgData(orgId);setMessage("Đã lưu học viên lên cơ sở dữ liệu.");
    }catch(e){setMessage(String(e));}finally{setBusy(false);}
  }
  async function addTransaction(){
    if(!orgId||!/^\d+$/.test(amount)||Number(amount)<1||!Number.isSafeInteger(Number(amount))||category.trim().length<2){setMessage("Nhập số tiền VND nguyên dương và danh mục hợp lệ.");return;}
    if(method==="transfer"&&confirmed&&!reference.trim()){setMessage("Cần mã sao kê để xác nhận chuyển khoản.");return;}
    setBusy(true);setMessage("");
    if(!pendingTransactionKey.current)pendingTransactionKey.current=Crypto.randomUUID();
    try{
      const {error}=await db.from("transactions").insert({
        organization_id:orgId,kind,amount_vnd:Number(amount),category:category.trim(),method,
        status:confirmed?"confirmed":"pending",reference:reference.trim()||null,
        created_by:session!.user.id,idempotency_key:pendingTransactionKey.current,
      });
      if(error&&error.code!=="23505")throw new Error(error.message);
      pendingTransactionKey.current=null;setAmount("");setCategory("");setReference("");
      await loadOrgData(orgId);setMessage("Đã ghi giao dịch thực vào sổ.");
    }catch(e){setMessage(String(e));}finally{setBusy(false);}
  }
  async function flushPointQueue(){
    if(flushing.current)return flushing.current;
    const task=(async()=>{
      while(pointQueue.current.length){
        const batch=pointQueue.current.slice(0,20);
        const {error}=await db.from("trip_points").upsert(batch,{onConflict:"trip_id,captured_at",ignoreDuplicates:true});
        if(error)throw new Error(error.message);
        pointQueue.current.splice(0,batch.length);
      }
    })();
    flushing.current=task;
    try{await task;}finally{flushing.current=null;}
  }
  async function beginWatching(id:string){
    if(gpsWatch.current)return;
    const perm=await Location.requestForegroundPermissionsAsync();
    if(perm.status!=="granted")throw new Error("Chưa được cấp quyền vị trí khi sử dụng ứng dụng");
    const uid=(await db.auth.getUser()).data.user?.id;
    if(!uid)throw new Error("Phiên đăng nhập hết hạn");
    lastFix.current=null;setLiveMeters(0);
    gpsWatch.current=await Location.watchPositionAsync({
      accuracy:Location.Accuracy.BestForNavigation,timeInterval:5000,distanceInterval:5,
    },(fix)=>{
      const {latitude,longitude,accuracy}=fix.coords;
      if(accuracy===null||accuracy>50||!Number.isFinite(latitude)||!Number.isFinite(longitude))return;
      const prev=lastFix.current;
      if(prev){
        const hop=distanceMeters(prev,{latitude,longitude});
        const dt=(fix.timestamp-prev.timestamp)/1000;
        if(plausibleHop(hop,dt))setLiveMeters(s=>s+hop);
      }
      lastFix.current={latitude,longitude,timestamp:fix.timestamp};
      pointQueue.current.push({trip_id:id,created_by:uid,captured_at:new Date(fix.timestamp).toISOString(),latitude,longitude,accuracy_m:accuracy});
      void flushPointQueue().catch(e=>setMessage(`Chưa đồng bộ GPS: ${String(e)}. Kiểm tra kết nối trước khi dừng.`));
    });
    setTripId(id);currentTrip.current=id;
  }
  async function startTrip(){
    if(!orgId||!session)return;
    setBusy(true);setMessage("");
    try{
      if(tripId){await beginWatching(tripId);setMessage("Đã nối lại hành trình đang mở.");return;}
      const perm=await Location.requestForegroundPermissionsAsync();
      if(perm.status!=="granted")throw new Error("Hãy cấp quyền định vị khi sử dụng ứng dụng");
      const {data,error}=await db.from("trips").insert({organization_id:orgId,created_by:session.user.id,
        student_id:chosenStudent,vehicle_id:chosenVehicle,status:"active"}).select("id").single();
      if(error||!data)throw new Error(error?.message??"Không tạo được chuyến đi");
      setTripId(data.id);currentTrip.current=data.id;
      try{await beginWatching(data.id);}catch(e){setMessage(`Chuyến đi đã tạo. Nhấn tiếp tục để bật GPS: ${String(e)}`);}
    }catch(e){setMessage(String(e));}finally{setBusy(false);}
  }
  async function stopTrip(){
    const id=currentTrip.current;
    if(!id)return;
    setBusy(true);setMessage("");
    try{
      gpsWatch.current?.remove();gpsWatch.current=null;
      await flushPointQueue();
      if(pointQueue.current.length)throw new Error("Chưa đồng bộ hết điểm GPS. Cần có mạng để kết thúc chuyến đi.");
      const {data,error}=await db.rpc("finish_trip",{p_trip_id:id});
      if(error)throw new Error(error.message);
      setTripId(null);currentTrip.current=null;lastFix.current=null;setLiveMeters(0);
      if(orgId)await loadOrgData(orgId);
      setMessage(`Hoàn tất: ${(Number(data)/1000).toLocaleString("vi-VN",{maximumFractionDigits:2})} km theo tính toán tại cơ sở dữ liệu.`);
    }catch(e){setMessage(String(e));}finally{setBusy(false);}
  }
  if(!ready)return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#2563eb"/></SafeAreaView>;
  if(!session)return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={{flexGrow:1,justifyContent:"center",padding:24}} keyboardShouldPersistTaps="handled">
    <View style={styles.card}><Text style={styles.logo}>🚘 {brand.name}</Text><Text style={styles.heading}>Đăng nhập</Text><Text style={styles.sub}>Dùng chung tài khoản với website quản lý.</Text>
      <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address"/>
      <Input label="Mật khẩu (ít nhất 8 ký tự)" value={password} onChangeText={setPassword} secureTextEntry/>
      <Button title="Đăng nhập" onPress={()=>authenticate(false)} disabled={busy}/><Button title="Đăng ký" onPress={()=>authenticate(true)} secondary disabled={busy}/>
      {message?<Text style={styles.alert}>{message}</Text>:null}
    </View></ScrollView></SafeAreaView>;
  return <SafeAreaView style={styles.root}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==="ios"?"padding":undefined}>
    <View style={styles.header}><View><Text style={styles.logo}>🚘 {brand.name}</Text><Text style={styles.sub}>{session.user.email} · {brand.developer}</Text></View><Pressable onPress={()=>{if(currentTrip.current){setMessage("Hãy kết thúc hành trình GPS trước khi đăng xuất.");return;}void db.auth.signOut();}}><Text style={styles.logout}>Đăng xuất</Text></Pressable></View>
    {orgs.length>1&&<ScrollView horizontal showsHorizontalScrollIndicator={false} style={{maxHeight:52,flexGrow:0}} contentContainerStyle={{paddingHorizontal:16,paddingVertical:7,gap:8}}>{orgs.map(o=><Choice key={o.id} selected={orgId===o.id} label={o.name} onPress={()=>{if(currentTrip.current){setMessage("Cần kết thúc chuyến đi trước khi chuyển tổ chức.");return;}setOrgId(o.id);}}/>)}</ScrollView>}
    {!orgId?<View style={{padding:20}}><Text style={styles.heading}>Chưa có tổ chức</Text><Text style={styles.sub}>Tạo tổ chức lần đầu trên trang web, sau đó mở lại ứng dụng.</Text><Button title="Mở website" onPress={()=>{const url=process.env.EXPO_PUBLIC_WEB_URL;if(url)void Linking.openURL(url);else setMessage("Chưa cấu hình EXPO_PUBLIC_WEB_URL");}}/><Button title="Tải lại" onPress={()=>loadOrganizations().catch(e=>setMessage(String(e)))} secondary/></View>:<>
      <View style={styles.tabBar}>{([["home","Tổng quan"],["students","Học viên"],["ledger","Thu chi"],["gps","GPS"]] as const).map(([id,label])=><Pressable key={id} onPress={()=>{setTab(id);setMessage("");}} style={[styles.tab,tab===id&&{backgroundColor:brand.color}]}><Text style={[styles.tabText,tab===id&&{color:"#fff"}]}>{label}</Text></Pressable>)}</View>
      <ScrollView style={{flex:1}} contentContainerStyle={{padding:16,paddingBottom:70}} keyboardShouldPersistTaps="handled">
        <Text style={styles.organization}>{orgs.find(o=>o.id===orgId)?.name}</Text>
        {message?<Text style={styles.alert}>{message}</Text>:null}
        {tab==="home"&&<><Text style={styles.heading}>Tổng quan trong tháng</Text>
          <View style={styles.stat}><Text style={styles.label}>Tổng thu đã đối soát</Text><Text style={styles.amount}>{money(Number(summary?.income_vnd??0))}</Text></View>
          <View style={styles.stat}><Text style={styles.label}>Tổng chi đã đối soát</Text><Text style={styles.amount}>{money(Number(summary?.expense_vnd??0))}</Text></View>
          <View style={styles.stat}><Text style={styles.label}>Lợi nhuận (chưa tính thuế)</Text><Text style={styles.amount}>{money(Number(summary?.income_vnd??0)-Number(summary?.expense_vnd??0))}</Text></View>
          <View style={styles.stat}><Text style={styles.label}>Học viên / GPS tháng</Text><Text style={styles.amount}>{summary?.student_count??0} / {(Number(summary?.gps_distance_m??0)/1000).toFixed(1)} km</Text></View>
          <Text style={styles.sub}>Báo cáo đọc trực tiếp từ Supabase và chỉ tính giao dịch confirmed.</Text>
          <Button title="Làm mới dữ liệu" onPress={()=>loadOrgData(orgId).catch(e=>setMessage(String(e)))} secondary/>
        </>}
        {tab==="students"&&<><Text style={styles.heading}>Học viên</Text><View style={styles.card}>
          <Input label="Tên học viên *" value={studentName} onChangeText={setStudentName}/><Input label="Điện thoại" value={studentPhone} onChangeText={setStudentPhone}/>
          <Button title="Lưu học viên" onPress={addStudent} disabled={busy}/></View>
          {students.map(s=><View style={styles.listItem} key={s.id}><Text style={styles.itemTitle}>{s.full_name} · {s.license_class}</Text><Text style={styles.sub}>{s.phone||"Chưa có số điện thoại"} · Đã ghi {(Number(s.completed_distance_m)/1000).toFixed(1)} / mục tiêu {Number(s.target_km)} km</Text></View>)}
          {!students.length&&<Text style={styles.sub}>Chưa có học viên trong cơ sở dữ liệu.</Text>}
        </>}
        {tab==="ledger"&&<><Text style={styles.heading}>Ghi thu / chi</Text><View style={styles.card}>
          <Text style={styles.label}>Loại giao dịch</Text><View style={styles.choices}><Choice selected={kind==="income"} label="Thu" onPress={()=>setKind("income")}/><Choice selected={kind==="expense"} label="Chi" onPress={()=>setKind("expense")}/></View>
          <Input label="Số tiền nguyên VND *" keyboardType="numeric" value={amount} onChangeText={setAmount}/><Input label="Danh mục *" value={category} onChangeText={setCategory}/>
          <Text style={styles.label}>Phương thức</Text><View style={styles.choices}><Choice selected={method==="cash"} label="Tiền mặt" onPress={()=>setMethod("cash")}/><Choice selected={method==="transfer"} label="Chuyển khoản" onPress={()=>setMethod("transfer")}/></View>
          <Text style={styles.label}>Đối soát</Text><View style={styles.choices}><Choice selected={!confirmed} label="Chờ xác nhận" onPress={()=>setConfirmed(false)}/><Choice selected={confirmed} label="Đã xác minh" onPress={()=>setConfirmed(true)}/></View>
          {method==="transfer"&&<Input label="Mã sao kê (bắt buộc khi xác nhận)" value={reference} onChangeText={setReference}/>}
          <Text style={styles.sub}>QR không tự xác nhận ngân hàng đã nhận tiền.</Text><Button title="Lưu giao dịch" onPress={addTransaction} disabled={busy}/>
        </View>{ledger.map(t=><View style={styles.listItem} key={t.id}><Text style={styles.itemTitle}>{t.kind==="income"?"+":"−"}{money(Number(t.amount_vnd))} · {t.category}</Text><Text style={styles.sub}>{t.status==="confirmed"?"Đã xác minh":"Chờ đối soát"} · {new Date(t.recorded_at).toLocaleDateString("vi-VN")}</Text></View>)}
        </>}
        {tab==="gps"&&<><Text style={styles.heading}>Ghi hành trình GPS</Text><Text style={styles.sub}>Vị trí thực, chỉ ghi khi ứng dụng đang mở và được cấp quyền. Quãng đường cuối được tính từ điểm GPS lưu ở máy chủ.</Text>
          <View style={styles.card}><Text style={styles.label}>Gắn với học viên (không bắt buộc)</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}><Choice label="Không chọn" selected={!chosenStudent} onPress={()=>setChosenStudent(null)}/>{students.map(s=><Choice key={s.id} selected={chosenStudent===s.id} label={s.full_name} onPress={()=>setChosenStudent(s.id)}/>)}</ScrollView>
          <Text style={styles.label}>Xe tập lái</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}><Choice label="Không chọn" selected={!chosenVehicle} onPress={()=>setChosenVehicle(null)}/>{vehicles.map(v=><Choice key={v.id} selected={chosenVehicle===v.id} label={v.plate} onPress={()=>setChosenVehicle(v.id)}/>)}</ScrollView>
          <Text style={[styles.metric,{color:brand.color}]}>{(liveMeters/1000).toFixed(2)} km</Text><Text style={styles.sub}>Ước lượng trong phiên hiện tại (trước khi máy chủ lọc nhiễu)</Text>
          {!tripId?<Button title="▶ Bắt đầu ghi GPS" onPress={startTrip} disabled={busy}/>:<><Button title={gpsWatch.current?"Đang ghi GPS":"▶ Tiếp tục ghi GPS"} onPress={startTrip} disabled={busy||Boolean(gpsWatch.current)} secondary/><Button title="■ Kết thúc và tính km" onPress={stopTrip} danger disabled={busy}/></>}
          <Text style={styles.alert}>⚠️ Giữ ứng dụng mở trong lúc ghi. Chưa hỗ trợ GPS nền, bản đồ thời gian thực hoặc chế độ offline.</Text>
        </View></>}
      </ScrollView>
    </>}
  </KeyboardAvoidingView></SafeAreaView>;
}
const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:"#f5f8fc"},center:{flex:1,justifyContent:"center",alignItems:"center"},
  header:{backgroundColor:"#fff",paddingHorizontal:18,paddingVertical:14,borderBottomWidth:1,borderBottomColor:"#e5eaf1",flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  logo:{fontSize:20,fontWeight:"800",color:"#182643"},heading:{fontSize:24,fontWeight:"800",color:"#101828",marginBottom:12},
  sub:{color:"#69778c",fontSize:13,lineHeight:20,marginTop:5},organization:{fontWeight:"700",fontSize:13,color:"#5f6d80",marginBottom:15},
  label:{fontSize:13,color:"#45536c",fontWeight:"700",marginBottom:7},
  input:{borderRadius:11,borderWidth:1,borderColor:"#d7dfe9",backgroundColor:"#fff",padding:12,fontSize:15,color:"#14223b",minHeight:46},
  card:{backgroundColor:"#fff",borderRadius:18,padding:17,marginBottom:16,borderWidth:1,borderColor:"#e5eaf1"},
  stat:{backgroundColor:"#fff",borderRadius:15,padding:17,marginVertical:6,borderWidth:1,borderColor:"#e5eaf1"},
  amount:{fontSize:25,fontWeight:"800",color:"#1c3561",marginTop:6},
  button:{minHeight:47,backgroundColor:"#2563eb",alignItems:"center",justifyContent:"center",borderRadius:12,marginTop:10,paddingHorizontal:14},
  buttonText:{color:"#fff",fontWeight:"700",fontSize:15},secondary:{backgroundColor:"#eaf0fa"},danger:{backgroundColor:"#ae2d3b"},
  tabBar:{backgroundColor:"#fff",flexDirection:"row",padding:9,gap:5},tab:{flex:1,paddingVertical:11,alignItems:"center",borderRadius:10},activeTab:{backgroundColor:"#2563eb"},tabText:{fontSize:12,fontWeight:"700",color:"#586a83"},
  choice:{backgroundColor:"#e8edf7",borderRadius:9,paddingVertical:9,paddingHorizontal:12},choiceActive:{backgroundColor:"#2563eb"},choiceText:{color:"#253a59",fontSize:13,fontWeight:"600"},
  choices:{flexDirection:"row",gap:8,marginBottom:15,paddingVertical:4},
  listItem:{backgroundColor:"#fff",borderRadius:13,borderWidth:1,borderColor:"#e3eaf4",padding:14,marginBottom:9},
  itemTitle:{fontSize:15,fontWeight:"700",color:"#1c2940"},metric:{fontSize:45,fontWeight:"800",color:"#2563eb",textAlign:"center",marginTop:20},
  alert:{backgroundColor:"#fff6e6",color:"#825314",padding:12,borderRadius:10,overflow:"hidden",fontSize:13,marginVertical:12},logout:{color:"#475467",fontSize:13,fontWeight:"600"},
});
