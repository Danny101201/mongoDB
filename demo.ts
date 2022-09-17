import { MongoClient, TransactionOptions } from 'mongodb';
async function main(){
  const url = 'mongodb+srv://danny101201:Kjhg2365987@cluster0.tcgkw0t.mongodb.net/?retryWrites=true&w=majority';
  const client=new MongoClient(url);
  try{
    await client.connect().then(()=>console.log('db is running'));
    // createListing(client,{
    //   name:'Danny',
    //   age:24
    // })
    // findListingsWithminimumBedrooms(client, { minimumNuberOfBedrooms :10})
    //  await printCheapestSuburbs(client,'Brazil',10)

    await createReservation(client,
      "leslie@example.com",
      "Infinite Views",
      [new Date("2019-12-31"), new Date("2020-01-01")],
      { pricePerNight: 180, specialRequests: "Late checkout", breakfastIncluded: true });
  }catch(err){
    console.log(err)
    await client.close();
  }finally{
  }
}
main().catch(console.error)

// CRUD
async function deleteOne(client: MongoClient, name:string){
  const result = await client.db("sample_airbnb").collection("listingsAndReviews").deleteOne(
    { name});
  console.log(result);
}
async function addNewPropertyName(client: MongoClient){
  const result = await client.db("sample_airbnb").collection("listingsAndReviews").updateOne(
    { property_type: {$exists:false} }, { $set: { property_type:'unKnown'} },{upsert:true});
  console.log(result);
}
async function updateListingByname(client: MongoClient,changeName:string,changeNameValue:string){
  const result = await client.db("sample_airbnb").collection("listingsAndReviews").updateOne(
    { name: changeName }, { $set: {name:changeNameValue} });
  console.log(result);
}
async function getTotalCount(client: MongoClient){
  const total = await client.db("sample_airbnb").collection("listingsAndReviews").count();
  console.log(total)
}
async function findListingsWithminimumBedrooms(
  client:MongoClient,{
    minimumNuberOfBedrooms = 0,
    minimumNuberOfBathrooms = 0,
    maxNumberOfResult=10
  }: { minimumNuberOfBedrooms?: number, minimumNuberOfBathrooms?: number, maxNumberOfResult?:number }
){
  const cursor = await client.db("sample_airbnb").collection("listingsAndReviews").find({
    bedrooms: { $gte: minimumNuberOfBedrooms },
    bathrooms: { $gte: minimumNuberOfBathrooms },
  }).sort({ last_review: -1 }).limit(maxNumberOfResult).project({ name:1 });
  // db.students.pretty()
  const results = await cursor.toArray()
  console.log(results)
}
async function findOneListingByname(client: MongoClient,name:string){
  const result = await client.db("sample_airbnb").collection("ListingsAndRewiew").findOne({ name });
  if (result) {
    return console.log(result);
  }
  console.log(`list not found name : ${name}`)

}
async function createListing(client: MongoClient,newListing:{name:string,age:number}){
  const result = await client.db("sample_airbnb").collection("ListingsAndRewiew").insertOne(newListing);
    return console.log(result);

}
async function createMultipleListing(client: MongoClient, newListings: any[]){
  const result = await client.db("sample_airbnb").collection("ListingsAndRewiew").insertMany(newListings);
  console.log(result);
}
async function listDataBases(client: MongoClient){
  const database = await client.db().admin().listDatabases();
  console.log(database)
}

// Filter outPut Data
async function printCheapestSuburbs(client: MongoClient,country:string,maxNumberToPrint:number){
  const pineline = [
    {
      '$match': {
        'bathrooms': 1,
        'address.country': country,
        'address.suburb': {
          '$exists': 1,
          '$ne': ''
        }
      }
    }, {
      '$group': {
        '_id': '$address.suburb',
        'averagePrice': {
          '$avg': '$price'
        }
      }
    }, {
      '$sort': {
        'averagePrice': 1
      }
    }, {
      '$limit': maxNumberToPrint
    }
  ]
  const aggCusor = client.db("sample_airbnb").collection("ListingsAndRewiew").aggregate(pineline)
  await aggCusor.forEach(airbnbListing=>{
    console.log(`${airbnbListing._id} ${airbnbListing.averagePrice}`)
  })

}
async function createReservation(client: MongoClient, userEmail: string, nameOfListing: any, reservationDates: any, reservationDetails: any){
  const userCollection = client.db('sample_airbnb').collection("users");
  const listingsAndReviews = client.db('sample_airbnb').collection("listingsAndReviews");
  const resevation = createResevationDocument(nameOfListing, reservationDates, reservationDetails);
  const session = client.startSession();

  const transactionOptions = {
    readPreference: 'primary',
    readConcern: { level: 'local' },
    writeConcern: { w: 'majority' }
  };
  try{
    const transactionResults = await session.withTransaction(async () => {
      const usersUpdateResults = await userCollection.updateOne({ email: userEmail },
        { $addToSet: { resevations: resevation }}, 
        { session })
      console.log(`${usersUpdateResults.matchedCount} document(s) found in the users collection with the email address ${userEmail}.`);
      console.log(`${usersUpdateResults.modifiedCount} document(s) was/were updated to include the reservation.`);

      const isListingReservedResults = await listingsAndReviews.find(
        { name: nameOfListing, datesReserved: { $in: reservationDates }})
      if (isListingReservedResults){
        await session.abortTransaction();
        console.error("This listing is already reserved for at least one of the given dates. The reservation could not be created.");
        console.error("Any operations that already occurred as part of this transaction will be rolled back.")
        return;
      }
      const listingsAndReviewsUpdateResults = await listingsAndReviews.updateOne(
        { name: nameOfListing },
        { $addToSet: { datesReserved: { $each: reservationDates } } },
        { session });
      console.log(`${listingsAndReviewsUpdateResults.matchedCount} document(s) found in the listingsAndReviews collection with the name ${nameOfListing}.`);
      console.log(`${listingsAndReviewsUpdateResults.modifiedCount} document(s) was/were updated to include the reservation dates.`);
    }, transactionOptions as unknown as TransactionOptions);

    if (transactionResults) {
      console.log("The reservation was successfully created.");
    } else {
      console.log("The transaction was intentionally aborted.");
    }
  }catch(e){
    console.log("The transaction was aborted due to an unexpected error: " + e);
  }finally{
    session.endSession();
  }
}

function createResevationDocument(nameOfListing: string, reservationDates: Date[], reservationDetails: {[key:string]:string|number}){
  let reservation ={
    name: nameOfListing,
    dates: reservationDates,
    reservationDetails
  }
  return reservation
}