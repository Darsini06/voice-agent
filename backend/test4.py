from pymongo import MongoClient

client = MongoClient("mongodb+srv://Darsini:Muruga27@voice-agent.rfvpkvc.mongodb.net/?appName=voice-agent")

print(client.list_database_names())