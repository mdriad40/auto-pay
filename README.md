# 🚀 bKash Custom Payment Gateway & Project Aggregator

আপনার দেওয়া রিকোয়ারমেন্ট অনুযায়ী সম্পূর্ণ সিস্টেমটি **`bKash Payment Gateway`** ফোল্ডারে প্রস্তুত করা হয়েছে।

---

## ⚡ ১. প্রথম ধাপ: Supabase-এ ডাটাবেস টেবিল তৈরি (১ মিনিট)

আপনার Supabase প্রোজেক্টে টেবিল দুইটি তৈরি করতে:
1. আপনার Supabase ড্যাশবোর্ডের SQL Editor ওপেন করুন:
   👉 **[Supabase SQL Editor](https://supabase.com/dashboard/project/gruzpbfhhujmerwbdamo/sql)**
2. এই ফোল্ডারের [`supabase_schema.sql`](file:///c:/My_Programme/bKash_api_check/bKash%20Payment%20Gateway/supabase_schema.sql) ফাইলের সম্পূর্ণ কোড কপি করে SQL Editor-এ পেস্ট করে **"RUN"** বাটনে চাপ দিন।
3. এর মাধ্যমে `gateway_projects` এবং `gateway_transactions` টেবিল দুইটি সাথে সাথে তৈরি হয়ে যাবে।

---

## 🖥️ ২. গেটওয়ে সার্ভার রান করা

1. [`run-gateway.bat`](file:///c:/My_Programme/bKash_api_check/bKash%20Payment%20Gateway/run-gateway.bat) ফাইলে ডাবল ক্লিক করুন অথবা টার্মিনালে রান করুন:
   ```powershell
   node server.js
   ```
2. ব্রাউজারে প্রবেশ করুন:
   👉 **http://localhost:7000**

---

## 🔑 ৩. আপনার মূল bKash ক্রেডেনশিয়ালস কীভাবে নিরাপদে রাখবেন?

আপনার মূল মার্চেন্ট ক্রেডেনশিয়ালস যাতে কোনো গ্রাহক বা ফ্রন্টএন্ড থেকে দেখা না যায়, তার জন্য এটি শুধুমাত্র সার্ভার প্রান্তে থাকে:

### অপশন ১: Environment Variables (সর্বোচ্চ নিরাপদ / Recommended)
সার্ভার চালু করার সময় টার্মিনাল বা হোস্টিং প্রোভাইডারে (VPS / Railway / Render / DigitalOcean) সেট করবেন:
```powershell
$env:BKASH_USERNAME="আপনার_ইউজারনেম"
$env:BKASH_PASSWORD="আপনার_পাসওয়ার্ড"
$env:BKASH_APP_KEY="আপনার_অ্যাপ_কি"
$env:BKASH_APP_SECRET="আপনার_অ্যাপ_সিক্রেট"
node server.js
```

### অপশন ২: [`config.js`](file:///c:/My_Programme/bKash_api_check/bKash%20Payment%20Gateway/config.js) ফাইল
- আপনার ব্যাকএন্ডের `config.js` ফাইলের `bkash` ব্লকে আপনার ক্রেডেনশিয়ালস সুরক্ষিত থাকবে। 
- এটি শুধুমাত্র `server.js` ব্যবহার করে সরাসরি bKash সার্ভারের সাথে কমিউনিকেট করবে। থার্ড-পার্টি প্রজেক্ট শুধু পাবে `Api-Key` এবং `License-Key`।

---

## 🧪 ৪. টেস্ট করার পদ্ধতি

1. **ড্যাশবোর্ড ওপেন করুন:** `http://localhost:7000`
2. **"New Project"** বাটনে ক্লিক করে প্রজেক্টের নাম (যেমন: `MyShopApp`), ইমেইল, ফোন এবং ওয়েবসাইটের ইউআরএল (যেমন: `http://localhost:7000`) দিয়ে সাবমিট করুন।
3. সিস্টেম অটোমেটিক **API Key** ও **License Key** তৈরি করে দেবে।
4. **টেস্ট ক্লায়েন্ট পেজে যান:** `http://localhost:7000/test-client.html`
5. জেনারেট হওয়া কি-গুলো দিয়ে পেমেন্ট রিকোয়েস্ট পাঠিয়ে টেস্ট করুন!
