fn main() {
    let json = serde_json::json!({ "idCode": 13 });
    let doc: Result<mongodb::bson::Document, _> = serde_json::from_value(json.clone());
    println!("from_value: {:?}", doc);
    
    let doc2 = mongodb::bson::to_document(&json);
    println!("to_document: {:?}", doc2);
}
