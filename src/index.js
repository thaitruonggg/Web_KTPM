const express = require('express')
const mongoose = require('mongoose')
const path = require('path')
const bcrypt = require('bcrypt')
const session = require('express-session');
const {dataUser, dataProduct} = require('./config');
const { log } = require('console');
const PORT = process.env.PORT || 9000;
const { ObjectId } = require('mongodb');
const bodyParser = require('body-parser');

let globalSearchResult = [];

const app = express()
// conver data into JSON format
app.use(express.json())

app.use(express.urlencoded({extended: false}))

app.use(bodyParser.json());
//kiểm tra trạng thái người dungf (đã login chưa)

//use ejs as the view enginne 
app.set('view engine', 'ejs');
// static file
app.use(express.static('public'))

app.use(session({
    secret: 'secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  }));

app.use(calculateTotalQuantity);

// user signup
app.post("/signup",async (req,res)=>{
    const data ={
        name :  req.body.username,
        password: req.body.password
    }

    //check if the user aldready exist in the database

    const existingUser = await dataUser.findOne({name: data.name})
    if(existingUser != null){
        res.render('signup',{ error: "User has aldready been taken" });
        return;

    }else{
        // hash the password using bcrypt
        const saltRounds = 10
        const hashedPassword = await bcrypt.hash(data.password, saltRounds)

        data.password = hashedPassword

        const userdata = await dataUser.insertMany(data)
        console.log(userdata)
        res.render('login', {message: 'Login successfully'}); 

    }

})
//Login user
app.post("/login",async (req,res)=>{
    try{

        const check = await dataUser.findOne({name:req.body.username})
        if(!check){
             res.render('login',{ error: "User not found, please try again" });
             return;
        }
        const isPasswordMatch = await bcrypt.compare(req.body.password, check.password)
        //đăng nhập thành công. 
        if(isPasswordMatch){
            req.session.username = req.body.username; 
            const product = await dataProduct.find().sort({ _id: -1 }).limit(12);
            res.render("index" ,{ pros: product, userN: req.session.username} )
        }else{
            req.send("wrong password")
        }
    }catch(err){
        res.send("wrong detail")
        console.log(err);
    }
})

app.post('/add-to-cart',calculateTotalQuantity, (req, res) => {
    const { productName } = req.body;
    // Kiểm tra xem người dùng đã đăng nhập chưa
    if (!req.session.username) {
      res.status(401).send('Bạn cần đăng nhập trước khi thêm sản phẩm vào giỏ hàng.');
      return;
    }
    // Thêm sản phẩm vào giỏ hàng trong session
    if (!req.session.cart) {
      req.session.cart = {};
    }
    if (req.session.cart[productName]) {
        // Nếu đã tồn tại, tăng số lượng lên 1
        req.session.cart[productName]++;
    } else {
        // Nếu chưa tồn tại, đặt số lượng là 1
        req.session.cart[productName] = 1;
    }
    res.redirect('/index');
  });

app.post('/updateCount',calculateTotalQuantity, async(req, res) => {
    const { value, bookPrice } =  req.body;
     // Kiểm tra xem người dùng đã đăng nhập chưa
    if (!req.session.username) {
        res.status(401).send('Bạn cần đăng nhập để xem giỏ hàng.');
        return;
      }
      if(req.session.cart){
          const cartItems = req.session.cart;
          const bookIds = Object.keys(cartItems);

          const listCart = await dataProduct.find({ name: {$in: bookIds} });
          // tổng tiền trong cart.ejs
          var totalPrice = 0 
          listCart.forEach(cart => {
              totalPrice = totalPrice + cart.sach[0].gia
          });
      
        totalPrice = totalPrice - bookPrice + (bookPrice*value)
    
        res.render('cart', { 
            userN: req.session.username, 
            login: "login",
            logout: "logout",
            carts: res.locals.carts,
            listCart,
            totalPrice})
    
      }else{
        return res.status(400).send('error');
      }
      
      // Truy vấn dữ liệu sản phẩm dựa trên tên trong session cart
});  

app.get('/checkSession', (req, res) => {
    if (req.session.username) {
        res.send({ loggedIn: true, user: req.session.username });
    } else {
        res.send({ loggedIn: false });
    }
});

app.get("/", async (req, res) => {
        const product = await dataProduct.find().sort({ _id: -1 }).limit(12);
    res.render("index", { pros: product, userN: req.session.username, login: "login", logout: "logout" });
});

app.get("/index", calculateTotalQuantity, async(req,res)=>{
    try{
        const product = await dataProduct.find().sort({ _id: -1 }).limit(12);
        res.render("index" ,{ pros: product,
             userN: req.session.username, 
             login: "login",
             logout: "logout",
             carts: res.locals.carts })
    }catch(err){
        res.send(err)
    }
    return
})

app.get("/signup",(req,res)=>{
    res.render("signup")
})

app.get("/login",(req,res)=>{
    res.render("login")
})

app.get("/logout", async (req, res) => {
    req.session.destroy();
    res.redirect("/index");
});

app.get("/productpage", (req,res)=>{
    res.render('productpage',{
        userN: req.session.username, 
        login: "login",
        logout: "logout",
        carts: res.locals.carts })
    return
})

app.get("/danhmuc",async(req,res)=>{
    const { filterem } = req.body;
    console.log(filterem);
    const product = await dataProduct.find()
    const searchResult = globalSearchResult;
    res.render('danhmuc',{ pros: product,
        userN: req.session.username, 
        login: "login",
        logout: "logout",
        carts: res.locals.carts,
        bookFound:  searchResult,
        }) 
})

app.post("/danhmuc",async(req,res)=>{
    const { filterem } = req.body;
    // console.log(filterem);
    const product2 = await dataProduct.find({ "Tags.tag": { $all: String(filterem) } });

    const searchResult = globalSearchResult;
    console.log(product2);
    let productToShow;
    
    if (product2 && product2.length > 0) {
        productToShow = product2;
    } else {
        productToShow = await dataProduct.find();
    }

    res.render('danhmuc',{ pros: productToShow,
        userN: req.session.username, 
        login: "login",
        logout: "logout",
        carts: res.locals.carts,
        bookFound:  searchResult,
        }) 
})

app.get('/search', async (req, res) => {
    try {
        const searchText = req.query.query;
        // Sử dụng biểu thức chính quy để tìm kiếm không phân biệt chữ in hoa/thường
        const regex = new RegExp(searchText, 'i');
        const result = await dataProduct.find({ name: { $regex: regex } });

        // Chuyển đổi kết quả thành mảng các tên sách
        const resultNames = result.map(item => item.name);

        // Lưu kết quả tìm kiếm vào biến toàn cục
        globalSearchResult = resultNames;

        // Redirect đến trang /danhmuc
        res.redirect('/danhmuc');

        /* res.redirect('/danhmuc?rand=' + Math.random())  */
         } catch (error) {
                console.error(error);
                res.status(500).json({ message: 'Internal server error' });
    }
});

app.get('/cart', async (req, res) => {
    
    // Kiểm tra xem người dùng đã đăng nhập chưa
    if (!req.session.username) {
      res.status(401).send('Bạn cần đăng nhập để xem giỏ hàng.');
      return;
    }
    if(req.session.cart){
        const cartItems = req.session.cart;
        const bookIds = Object.keys(cartItems);

    
    // Truy vấn dữ liệu sản phẩm dựa trên tên trong session cart
    const listCart = await dataProduct.find({ name: {$in: bookIds} });
    // tổng tiền trong cart.ejs
    var totalPrice = 0 
    var quantity =  req.session.cart
    listCart.forEach(cart => {
        totalPrice = totalPrice + req.session.cart[cart.name]*cart.sach[0].gia       
    });


    res.render('cart', { 
        userN: req.session.username, 
        login: "login",
        logout: "logout",
        carts: res.locals.carts,
        listCart,
        totalPrice,
        quantity})
    }else{
        res.redirect('/index')
    }
    
  }); 

app.get("/checkout",calculateTotalQuantity, (req, res)=>{
    res.render('checkout',{ 
        userN: req.session.username, 
        login: "login",
        logout: "logout",
        carts: res.locals.carts  })
})

app.get("/delivery",calculateTotalQuantity, (req, res)=>{
    res.render('delivery',{ 
        userN: req.session.username, 
        login: "login",
        logout: "logout",
        carts: res.locals.carts })
})






app.listen(PORT, () => {
    console.log(`Server is running on localhost:${PORT}`);
});















function calculateTotalQuantity(req, res, next) {
    let totalQuantity = 0;
    if (req.session.cart) {
        for (let productId in req.session.cart) {
            totalQuantity += req.session.cart[productId];
        }
    }
    res.locals.carts = totalQuantity;
    next();
}
